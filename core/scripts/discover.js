const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const yaml = require('js-yaml');

const { CONFIG_PATH, ensureConfig } = require('../paths');

function fetch(urlStr) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      return reject(new Error('无效 URL: ' + urlStr));
    }
    const mod = parsed.protocol === 'https:' ? https : http;
    const req = mod.request(urlStr, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9',
      },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetch(new URL(res.headers.location, urlStr).href).then(resolve).catch(reject);
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function extractDomains(html, baseHost) {
  const domains = new Set();

  // 匹配各种属性里的绝对 URL
  const patterns = [
    /src=["']?(https?:\/\/[^"'\s>]+)/gi,
    /href=["']?(https?:\/\/[^"'\s>]+)/gi,
    /url\(["']?(https?:\/\/[^"'\s)]+)/gi,
    /action=["']?(https?:\/\/[^"'\s>]+)/gi,
    /data-[a-z-]+=["']?(https?:\/\/[^"'\s>]+)/gi,
    /["'](https?:\/\/[a-z0-9.-]+)/gi, // 兜底：所有带协议的 URL
  ];

  patterns.forEach(re => {
    let m;
    while ((m = re.exec(html)) !== null) {
      try {
        const u = new URL(m[1]);
        if (u.host && u.host !== baseHost) {
          domains.add(u.host);
        }
      } catch (e) {}
    }
  });

  // 协议相对路径 //domain.com
  const protoRelative = /["'\s]\/(\/[a-z0-9][a-z0-9.-]*)/gi;
  let m2;
  while ((m2 = protoRelative.exec(html)) !== null) {
    try {
      const u = new URL('http:' + m2[1]);
      if (u.host && u.host !== baseHost) {
        domains.add(u.host);
      }
    } catch (e) {}
  }

  return [...domains].sort();
}

async function main() {
  ensureConfig();

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 解析失败:', e.message);
    process.exit(1);
  }

  let proxies = config.rules || [];
  if (proxies.length === 0) {
    console.log('配置文件中未找到任何代理规则');
    return;
  }

  console.log('\n🔍 扫描目标站点引用的外部域名...\n');

  const allKnownHosts = new Set();
  proxies.forEach(rule => {
    try { allKnownHosts.add(new URL(rule.target || rule.host).host); } catch (e) {}
  });

  const allUnknown = new Set();

  for (const rule of proxies) {
    const targetUrl = rule.target || rule.host;
    const listenPort = rule.listen || rule.port;
    let baseHost;
    try {
      baseHost = new URL(targetUrl).host;
    } catch (e) {
      console.warn(`⚠️ 跳过无效目标: ${targetUrl}`);
      continue;
    }

    console.log(`[${listenPort}] -> ${targetUrl}`);
    try {
      const html = await fetch(targetUrl);
      const found = extractDomains(html, baseHost);
      const unknown = found.filter(d => !allKnownHosts.has(d));
      unknown.forEach(d => allUnknown.add(d));

      if (found.length === 0) {
        console.log('   未发现外部域名引用\n');
      } else {
        found.forEach(d => {
          const mark = allKnownHosts.has(d) ? '✅ 已有规则' : '⚠️  未配置';
          console.log(`   ${d}  ${mark}`);
        });
        console.log();
      }
    } catch (e) {
      console.error(`   请求失败: ${e.message}\n`);
    }
  }

  if (allUnknown.size > 0) {
    const unknownList = [...allUnknown].sort();
    const usedPorts = new Set(proxies.map(r => r.listen || r.port).filter(Boolean));
    let nextPort = 18080;
    while (usedPorts.has(nextPort)) nextPort++;

    console.log(`📝 发现 ${unknownList.length} 个未配置的外部域名，自动追加到 config.yaml:`);
    unknownList.forEach(d => {
      // 防御：如果该域名在本次扫描前已被其他规则添加，则跳过
      const alreadyExists = proxies.some(r => {
        try { return new URL(r.target || r.host).host === d; } catch (e) { return false; }
      });
      if (alreadyExists) return;

      while (usedPorts.has(nextPort)) nextPort++;
      const name = d.replace(/\./g, '-');
      proxies.push({ name, listen: nextPort, target: `https://${d}` });
      usedPorts.add(nextPort);
      console.log(`   + [${nextPort}] -> https://${d}`);
      nextPort++;
    });

    // 备份旧配置
    const backupPath = CONFIG_PATH + '.backup.' + Date.now();
    fs.writeFileSync(backupPath, yaml.dump(config, { indent: 2, lineWidth: -1 }));

    config.rules = proxies;
    fs.writeFileSync(CONFIG_PATH, yaml.dump(config, { indent: 2, lineWidth: -1 }));

    console.log(`\n✅ 已自动写入 config.yaml（旧配置备份: ${path.basename(backupPath)}）`);
    console.log('请执行以下命令重启代理:\n');
    console.log('   pantoon restart\n');
  } else {
    console.log('✅ 所有外部域名均已配置，无需补充\n');
  }

  console.log('提示：如果目标站是 SPA（单页应用），首屏 HTML 可能不包含所有资源，\n      建议进入页面后通过浏览器开发者工具(Network)进一步排查。\n');
}

main();

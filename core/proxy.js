const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');
const zlib = require('zlib');
const yaml = require('js-yaml');

const { CONFIG_PATH, PID_PATH } = require('./paths');

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function shouldRewrite(type) {
  if (!type) return false;
  const t = type.toLowerCase();
  return t.includes('text/') ||
         t.includes('application/javascript') ||
         t.includes('application/json') ||
         t.includes('application/xml') ||
         t.includes('application/html');
}

function decompress(buffer, encoding) {
  return new Promise((resolve, reject) => {
    if (!encoding) return resolve(buffer);
    const method = encoding === 'gzip' ? zlib.gunzip :
                   encoding === 'deflate' ? zlib.inflate :
                   encoding === 'br' ? zlib.brotliDecompress : null;
    if (!method) return resolve(buffer);
    method(buffer, (err, result) => err ? reject(err) : resolve(result));
  });
}

function compress(buffer, encoding) {
  return new Promise((resolve, reject) => {
    if (!encoding) return resolve(buffer);
    const method = encoding === 'gzip' ? zlib.gzip :
                   encoding === 'deflate' ? zlib.deflate :
                   encoding === 'br' ? zlib.brotliCompress : null;
    if (!method) return resolve(buffer);
    method(buffer, (err, result) => err ? reject(err) : resolve(result));
  });
}

function startProxy(listenPort, targetUrlStr, allTargetUrls) {
  let parsed;
  try {
    parsed = new URL(targetUrlStr);
  } catch (e) {
    console.error(`❌ [${listenPort}] 目标地址格式错误: ${targetUrlStr}`);
    return;
  }

  const isHttps = parsed.protocol === 'https:';
  const targetModule = isHttps ? https : http;
  const targetPort = parsed.port || (isHttps ? 443 : 80);
  const targetHost = parsed.hostname;

  // 收集 config.json 中所有需要替换的域名（含子域名）
  const targetHosts = new Set();
  allTargetUrls.forEach(urlStr => {
    try { targetHosts.add(new URL(urlStr).host); } catch (e) {}
  });

  const server = http.createServer((req, res) => {
    const clientHost = req.headers.host || `localhost:${listenPort}`;

    const options = {
      hostname: targetHost,
      port: targetPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: targetHost,
      },
    };

    const proxyReq = targetModule.request(options, async (proxyRes) => {
      // 1. 处理重定向 Location
      if (proxyRes.headers.location) {
        let loc = proxyRes.headers.location;
        const escapedOrigin = `${parsed.protocol}//${parsed.host}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        loc = loc.replace(new RegExp(escapedOrigin, 'gi'), `http://${clientHost}`);
        loc = loc.replace(new RegExp(`//${parsed.host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), `//${clientHost}`);
        proxyRes.headers.location = loc;
      }

      // 2. 抹掉 Set-Cookie 里的 Domain
      if (proxyRes.headers['set-cookie']) {
        proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].map(cookie => {
          return cookie.replace(/Domain=[^;]+;?/i, '');
        });
      }

      const contentType = proxyRes.headers['content-type'] || '';
      const contentEncoding = proxyRes.headers['content-encoding'];

      // 3. 文本内容做域名替换（HTML/JS/CSS/JSON/XML...）
      if (shouldRewrite(contentType)) {
        const chunks = [];
        proxyRes.on('data', chunk => chunks.push(chunk));
        proxyRes.on('end', async () => {
          try {
            let body = Buffer.concat(chunks);
            body = await decompress(body, contentEncoding);

            let text = body.toString('utf8');
            targetHosts.forEach(host => {
              // 明文形式
              text = text.split(`https://${host}`).join(`http://${clientHost}`);
              text = text.split(`http://${host}`).join(`http://${clientHost}`);
              text = text.split(`//${host}`).join(`//${clientHost}`);
              // URL 编码形式（如 redirect?url=http%3A%2F%2Fhost%2Fpath）
              text = text.split(`https%3A%2F%2F${host}`).join(`http%3A%2F%2F${clientHost}`);
              text = text.split(`http%3A%2F%2F${host}`).join(`http%3A%2F%2F${clientHost}`);
              text = text.split(`%2F%2F${host}`).join(`%2F%2F${clientHost}`);
            });

            body = Buffer.from(text, 'utf8');
            if (contentEncoding) {
              body = await compress(body, contentEncoding);
            }

            // 替换后 body 长度变了，需清理旧的长度相关头
            delete proxyRes.headers['transfer-encoding'];
            proxyRes.headers['content-length'] = body.length;

            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            res.end(body);
          } catch (e) {
            console.error(`[${listenPort}] 响应体处理失败:`, e.message);
            if (!res.headersSent) {
              res.writeHead(502);
              res.end('Proxy Error');
            }
          }
        });
      } else {
        // 二进制内容直接透传
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      console.error(`[${listenPort}] 代理请求错误:`, err.message);
      if (!res.headersSent) {
        res.writeHead(502);
        res.end('Bad Gateway');
      }
    });

    req.pipe(proxyReq);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ [${listenPort}] 端口已被占用，跳过`);
    } else {
      console.error(`❌ [${listenPort}] 服务器错误:`, err.message);
    }
  });

  server.listen(listenPort, '0.0.0.0', () => {
    console.log(`✅ [${listenPort}] -> ${targetUrlStr}`);
  });
}

function main() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('未找到 config.yaml，请先创建配置文件');
    process.exit(1);
  }

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 解析失败:', e.message);
    process.exit(1);
  }

  const proxies = config.rules || [];
  if (proxies.length === 0) {
    console.log('配置文件中未找到任何代理规则');
    return;
  }

  console.log('\n========================================');
  console.log('  Pantoon 代理进程运行中');
  console.log('  请勿关闭此窗口，否则代理将停止');
  console.log('========================================\n');

  console.log(`🚀 批量跳板代理启动中...\n`);

  const ips = getLocalIPs();
  if (ips.length > 0) {
    console.log('本机局域网 IP:');
    ips.forEach(ip => console.log(`   ${ip}`));
    console.log();
  }

  const allTargetUrls = proxies.map(r => r.target || r.host).filter(Boolean);

  proxies.forEach((rule, index) => {
    const listenPort = rule.listen || rule.port;
    const target = rule.target || rule.host;
    if (!listenPort || !target) {
      console.warn(`⚠️ 跳过无效规则 #${index + 1}:`, JSON.stringify(rule));
      return;
    }
    startProxy(listenPort, target, allTargetUrls);
  });

  // 写入 PID 文件，方便 stop.js 准确关闭（不依赖 config.json 内容）
  fs.writeFileSync(PID_PATH, process.pid.toString());
}

main();

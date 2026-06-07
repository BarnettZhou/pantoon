const fs = require('fs');
const { URL } = require('url');
const yaml = require('js-yaml');
const { CONFIG_PATH, ensureConfig } = require('../paths');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('-')) {
    return process.argv[idx + 1];
  }
  return null;
}

function isValidIP(ip) {
  // 支持 IPv4 和 CIDR (x.x.x.x/y)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
  if (!ipv4Regex.test(ip) && !cidrRegex.test(ip)) return false;
  const parts = ip.split('/')[0].split('.');
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (isNaN(n) || n < 0 || n > 255) return false;
  }
  if (ip.includes('/')) {
    const prefix = parseInt(ip.split('/')[1], 10);
    if (prefix < 0 || prefix > 32) return false;
  }
  return true;
}

function addRule() {
  const listenStr = getArg('--listen') || getArg('-l');
  const target = getArg('--target') || getArg('-t');

  if (!listenStr || !target) {
    console.log(`
用法: pantoon add rule --listen <端口> --target <目标地址>

选项:
  --listen, -l   本机监听的端口
  --target, -t   要转发的目标地址（如 https://example.com）

示例:
  pantoon add rule --listen 18094 --target https://api.example.com
  pantoon add rule -l 18095 -t http://10.0.0.1:8080
`);
    process.exit(1);
  }

  const port = parseInt(listenStr, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error(`❌ 无效端口: ${listenStr}`);
    process.exit(1);
  }

  try {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('只支持 http:// 或 https://');
    }
  } catch (e) {
    console.error(`❌ 无效目标地址: ${target} (${e.message})`);
    process.exit(1);
  }

  ensureConfig();

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 读取失败:', e.message);
    process.exit(1);
  }

  const proxies = config.rules || [];

  const conflict = proxies.find(r => r.listen === port || r.port === port);
  if (conflict) {
    console.error(`❌ 端口 ${port} 已被占用: [${conflict.listen}] -> ${conflict.target}`);
    process.exit(1);
  }

  let name;
  try { name = new URL(target).host.replace(/\./g, '-'); } catch (e) { name = 'rule-' + (proxies.length + 1); }
  proxies.push({ name, listen: port, target });
  config.rules = proxies;

  try {
    fs.writeFileSync(CONFIG_PATH, yaml.dump(config, { indent: 2, lineWidth: -1 }));
    console.log(`\n✅ 已添加规则: [${port}] -> ${target}\n`);
    console.log('执行 pantoon restart 以生效\n');
  } catch (e) {
    console.error('config.yaml 写入失败:', e.message);
    process.exit(1);
  }
}

function addIPWhitelist() {
  const ip = process.argv[3];

  if (!ip) {
    console.log(`
用法: pantoon add ip-whitelist <IP 地址>

示例:
  pantoon add ip-whitelist 10.0.0.1
  pantoon add ip-whitelist 192.168.1.0/24
`);
    process.exit(1);
  }

  if (!isValidIP(ip)) {
    console.error(`❌ 无效 IP 地址: ${ip}`);
    process.exit(1);
  }

  ensureConfig();

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 读取失败:', e.message);
    process.exit(1);
  }

  const whitelist = config['ip-whitelist'] || [];
  if (whitelist.includes(ip)) {
    console.error(`❌ IP ${ip} 已在白名单中`);
    process.exit(1);
  }

  whitelist.push(ip);
  config['ip-whitelist'] = whitelist;

  try {
    fs.writeFileSync(CONFIG_PATH, yaml.dump(config, { indent: 2, lineWidth: -1 }));
    console.log(`\n✅ 已添加白名单 IP: ${ip}\n`);
  } catch (e) {
    console.error('config.yaml 写入失败:', e.message);
    process.exit(1);
  }
}

function main() {
  const type = process.argv[2];

  switch (type) {
    case 'rule':
      addRule();
      break;
    case 'ip-whitelist':
      addIPWhitelist();
      break;
    default:
      console.log(`
用法: pantoon add <rule | ip-whitelist>

  pantoon add rule --listen <端口> --target <目标地址>
  pantoon add ip-whitelist <IP 地址>
`);
      process.exit(1);
  }
}

main();

const fs = require('fs');
const { URL } = require('url');
const { CONFIG_PATH } = require('./paths');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('-')) {
    return process.argv[idx + 1];
  }
  return null;
}

function main() {
  const listenStr = getArg('--listen') || getArg('-l');
  const target = getArg('--target') || getArg('-t');

  if (!listenStr || !target) {
    console.log(`
用法: pantoon add --listen <端口> --target <目标地址>

选项:
  --listen, -l   本机监听的端口
  --target, -t   要转发的目标地址（如 https://example.com）

示例:
  pantoon add --listen 18094 --target https://api.example.com
  pantoon add -l 18095 -t http://10.0.0.1:8080
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

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.json 读取失败:', e.message);
    process.exit(1);
  }

  const proxies = config.proxies || [];

  const conflict = proxies.find(r => r.listen === port || r.port === port);
  if (conflict) {
    console.error(`❌ 端口 ${port} 已被占用: [${conflict.listen}] -> ${conflict.target}`);
    process.exit(1);
  }

  proxies.push({ listen: port, target });
  config.proxies = proxies;

  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    console.log(`\n✅ 已添加规则: [${port}] -> ${target}\n`);
    console.log('执行 pantoon restart 以生效\n');
  } catch (e) {
    console.error('config.json 写入失败:', e.message);
    process.exit(1);
  }
}

main();

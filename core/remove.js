const fs = require('fs');
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

  if (!listenStr) {
    console.log(`
用法: pantoon remove --listen <端口>

选项:
  --listen, -l   要删除的规则端口

示例:
  pantoon remove --listen 18094
  pantoon remove -l 18095
`);
    process.exit(1);
  }

  const port = parseInt(listenStr, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error(`❌ 无效端口: ${listenStr}`);
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
  const beforeLen = proxies.length;
  const removed = proxies.filter(r => r.listen === port || r.port === port);
  config.proxies = proxies.filter(r => r.listen !== port && r.port !== port);

  if (config.proxies.length === beforeLen) {
    console.error(`❌ 未找到端口 ${port} 对应的规则`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
    console.log(`\n✅ 已删除规则: [${port}] -> ${removed[0].target}\n`);
    console.log('执行 pantoon restart 以生效\n');
  } catch (e) {
    console.error('config.json 写入失败:', e.message);
    process.exit(1);
  }
}

main();

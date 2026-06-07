const fs = require('fs');
const yaml = require('js-yaml');
const { CONFIG_PATH } = require('../paths');

function removeRule() {
  const portStr = process.argv[3];

  if (!portStr) {
    console.log(`
用法: pantoon remove rule <端口>

示例:
  pantoon remove rule 18094
`);
    process.exit(1);
  }

  const port = parseInt(portStr, 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    console.error(`❌ 无效端口: ${portStr}`);
    process.exit(1);
  }

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 读取失败:', e.message);
    process.exit(1);
  }

  const proxies = config.rules || [];
  const beforeLen = proxies.length;
  const removed = proxies.filter(r => r.listen === port || r.port === port);
  config.rules = proxies.filter(r => r.listen !== port && r.port !== port);

  if (config.rules.length === beforeLen) {
    console.error(`❌ 未找到端口 ${port} 对应的规则`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(CONFIG_PATH, yaml.dump(config, { indent: 2, lineWidth: -1 }));
    console.log(`\n✅ 已删除规则: [${port}] -> ${removed[0].target}\n`);
    console.log('执行 pantoon restart 以生效\n');
  } catch (e) {
    console.error('config.yaml 写入失败:', e.message);
    process.exit(1);
  }
}

function removeIPWhitelist() {
  const ip = process.argv[3];

  if (!ip) {
    console.log(`
用法: pantoon remove ip-whitelist <IP 地址>

示例:
  pantoon remove ip-whitelist 10.0.0.1
`);
    process.exit(1);
  }

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 读取失败:', e.message);
    process.exit(1);
  }

  const whitelist = config['ip-whitelist'] || [];
  const beforeLen = whitelist.length;
  config['ip-whitelist'] = whitelist.filter(entry => entry !== ip);

  if (config['ip-whitelist'].length === beforeLen) {
    console.error(`❌ 未找到 IP ${ip} 对应的白名单条目`);
    process.exit(1);
  }

  try {
    fs.writeFileSync(CONFIG_PATH, yaml.dump(config, { indent: 2, lineWidth: -1 }));
    console.log(`\n✅ 已删除白名单 IP: ${ip}\n`);
  } catch (e) {
    console.error('config.yaml 写入失败:', e.message);
    process.exit(1);
  }
}

function main() {
  const type = process.argv[2];

  switch (type) {
    case 'rule':
      removeRule();
      break;
    case 'ip-whitelist':
      removeIPWhitelist();
      break;
    default:
      console.log(`
用法: pantoon remove <rule | ip-whitelist>

  pantoon remove rule <端口>
  pantoon remove ip-whitelist <IP 地址>
`);
      process.exit(1);
  }
}

main();

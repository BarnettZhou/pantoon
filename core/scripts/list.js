const fs = require('fs');
const yaml = require('js-yaml');
const { CONFIG_PATH, ensureConfig } = require('../paths');

function listRules() {
  ensureConfig();

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 读取失败:', e.message);
    process.exit(1);
  }

  const rules = config.rules || [];

  if (rules.length === 0) {
    console.log('\n暂无转发规则\n');
    return;
  }

  console.log('\n当前转发规则\n');
  console.log('端口      目标地址');
  console.log('--------  -----------------------------');

  const TARGET_WIDTH = 29;
  function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 3) + '...' : str;
  }

  rules.forEach(rule => {
    const port = rule.listen;
    const target = truncate(rule.target || '', TARGET_WIDTH);
    console.log(`${String(port).padEnd(8)}  ${target}`);
  });

  console.log(`\n总计: ${rules.length} 条规则\n`);
}

function listIPWhitelist() {
  ensureConfig();

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 读取失败:', e.message);
    process.exit(1);
  }

  const whitelist = config['ip-whitelist'] || [];

  if (whitelist.length === 0) {
    console.log('\n暂无 IP 白名单（拒绝所有访问）\n');
    return;
  }

  console.log('\n当前 IP 白名单\n');
  whitelist.forEach((ip, i) => {
    console.log(`  ${i + 1}. ${ip}`);
  });
  console.log(`\n总计: ${whitelist.length} 条\n`);
}

function main() {
  const type = process.argv[2];

  switch (type) {
    case 'rule':
      listRules();
      break;
    case 'ip-whitelist':
      listIPWhitelist();
      break;
    default:
      console.log(`
用法: pantoon list <rule | ip-whitelist>

  pantoon list rule
  pantoon list ip-whitelist
`);
      process.exit(1);
  }
}

main();

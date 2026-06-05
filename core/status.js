const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const { CONFIG_PATH, ensureConfig } = require('./paths');

function getPortPid(port) {
  try {
    const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length >= 5 && parts[3] === 'LISTENING') {
        const localAddr = parts[1];
        if (localAddr.endsWith(`:${port}`)) {
          return parts[4];
        }
      }
    }
  } catch (e) {
    // port not found
  }
  return null;
}

function main() {
  ensureConfig();

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 解析失败:', e.message);
    process.exit(1);
  }

  const proxies = config.rules || [];

  console.log('\n当前端口转发情况\n');
  console.log('端口      目标地址                       状态      PID');
  console.log('--------  -----------------------------  --------  --------');

  const TARGET_WIDTH = 29;
  function truncate(str, max) {
    return str.length > max ? str.slice(0, max - 3) + '...' : str;
  }

  let runningCount = 0;
  proxies.forEach(rule => {
    const port = rule.listen;
    const target = truncate(rule.target || '', TARGET_WIDTH);
    const pid = getPortPid(port);
    const status = pid ? '运行中' : '未运行';
    if (pid) runningCount++;
    console.log(`${String(port).padEnd(8)}  ${target.padEnd(TARGET_WIDTH)}  ${status.padEnd(8)}  ${pid || '-'}`);
  });

  console.log(`\n总计: ${proxies.length} 条规则, ${runningCount} 个运行中\n`);
}

main();

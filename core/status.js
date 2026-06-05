const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { CONFIG_PATH } = require('./paths');

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
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('config.json 不存在');
    process.exit(1);
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.json 解析失败:', e.message);
    process.exit(1);
  }

  const proxies = config.proxies || [];

  console.log('\n当前端口转发情况\n');
  console.log('端口      目标地址                       状态      PID');
  console.log('--------  -----------------------------  --------  --------');

  let runningCount = 0;
  proxies.forEach(rule => {
    const port = rule.listen;
    const target = rule.target;
    const pid = getPortPid(port);
    const status = pid ? '运行中' : '未运行';
    if (pid) runningCount++;
    console.log(`${String(port).padEnd(8)}  ${target.padEnd(29)}  ${status.padEnd(8)}  ${pid || '-'}`);
  });

  console.log(`\n总计: ${proxies.length} 条规则, ${runningCount} 个运行中\n`);
}

main();

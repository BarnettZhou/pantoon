const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { CONFIG_PATH, PID_PATH, SERVER_PID_PATH, ensureConfig, getPortPid } = require('../paths');

function isProcessAlive(pidPath) {
  if (!fs.existsSync(pidPath)) return false;
  const pid = fs.readFileSync(pidPath, 'utf8').trim();
  if (!pid) return false;
  try {
    process.kill(parseInt(pid, 10), 0);
    return true;
  } catch (e) {
    return false;
  }
}

function main() {
  ensureConfig();

  const proxyRunning = isProcessAlive(PID_PATH);
  const serverRunning = isProcessAlive(SERVER_PID_PATH);

  console.log('\n Pantoon 服务状态');
  console.log(`   代理进程 : ${proxyRunning ? '运行中 ✅' : '未运行 ❌'}`);
  console.log(`   控制台进程: ${serverRunning ? '运行中 ✅' : '未运行 ❌'}`);

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

  const whitelist = config['ip-whitelist'] || [];
  if (whitelist.length > 0) {
    console.log('IP 白名单:');
    whitelist.forEach(ip => console.log(`   ${ip}`));
    console.log();
  } else {
    console.log('IP 白名单: 未配置（拒绝所有访问）\n');
  }
}

main();

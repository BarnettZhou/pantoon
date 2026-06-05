const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yaml = require('js-yaml');

const { CONFIG_PATH, PID_PATH, SERVER_PID_PATH, ensureConfig } = require('./paths');

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

function killPidFile(pidPath, label) {
  if (!fs.existsSync(pidPath)) return false;
  const pid = fs.readFileSync(pidPath, 'utf8').trim();
  if (!pid) {
    fs.unlinkSync(pidPath);
    return false;
  }
  try {
    execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' });
    console.log(`✅ 已关闭${label} (PID: ${pid})`);
    fs.unlinkSync(pidPath);
    return true;
  } catch (e) {
    fs.unlinkSync(pidPath);
    return false;
  }
}

function stopByConfig() {
  ensureConfig();

  let config;
  try {
    config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('config.yaml 解析失败:', e.message);
    process.exit(1);
  }

  const proxies = config.rules || [];
  const killedPids = new Set();

  proxies.forEach(rule => {
    const port = rule.listen;
    const pid = getPortPid(port);
    if (pid && !killedPids.has(pid)) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' });
        console.log(`✅ 已关闭端口 ${port} (PID: ${pid})`);
        killedPids.add(pid);
      } catch (e) {
        console.error(`❌ 关闭端口 ${port} (PID: ${pid}) 失败`);
      }
    } else if (!pid) {
      console.log(`⚠️ 端口 ${port} 未运行`);
    }
  });

  return killedPids.size;
}

function main() {
  console.log('\n正在关闭服务...\n');

  let stopped = 0;

  // 关闭代理进程
  if (killPidFile(PID_PATH, '代理进程')) stopped++;

  // 关闭控制台进程
  if (killPidFile(SERVER_PID_PATH, '控制台进程')) stopped++;

  if (stopped > 0) {
    console.log(`\n完成，共关闭 ${stopped} 个进程\n`);
    return;
  }

  // 兜底：按 config.yaml 中的端口扫描
  console.log('未找到 PID 文件，尝试按端口扫描...\n');
  const count = stopByConfig();
  console.log(`\n完成，共关闭 ${count} 个进程\n`);
}

main();

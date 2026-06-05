const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { CONFIG_PATH, PID_PATH } = require('./paths');

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

function stopByPidFile() {
  if (!fs.existsSync(PID_PATH)) return false;
  const pid = fs.readFileSync(PID_PATH, 'utf8').trim();
  if (!pid) {
    fs.unlinkSync(PID_PATH);
    return false;
  }
  try {
    execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' });
    console.log(`✅ 已关闭代理进程 (PID: ${pid})`);
    fs.unlinkSync(PID_PATH);
    return true;
  } catch (e) {
    console.error(`通过 PID 文件关闭失败，尝试按端口扫描...`);
    fs.unlinkSync(PID_PATH);
    return false;
  }
}

function stopByConfig() {
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
  console.log('\n正在关闭转发...\n');

  // 优先通过 PID 文件关闭，不依赖 config.json 内容
  if (stopByPidFile()) {
    console.log('\n完成\n');
    return;
  }

  // 兜底：按 config.json 中的端口扫描
  const count = stopByConfig();
  console.log(`\n完成，共关闭 ${count} 个进程\n`);
}

main();

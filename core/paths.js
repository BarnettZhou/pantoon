const os = require('os');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { execSync, spawnSync } = require('child_process');

function getGlobalConfigDir() {
  const platform = os.platform();
  let dir;
  if (platform === 'win32') {
    dir = path.join(process.env.USERPROFILE, '.pantoon');
  } else {
    dir = path.join(process.env.HOME, '.pantoon');
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getConfigPath() {
  const localConfig = path.join(process.cwd(), 'config.yaml');
  if (fs.existsSync(localConfig)) {
    return localConfig;
  }
  return path.join(getGlobalConfigDir(), 'config.yaml');
}

const CONFIG_PATH = getConfigPath();
const PID_PATH = path.join(getGlobalConfigDir(), '.pantoon.pid');
const SERVER_PID_PATH = path.join(getGlobalConfigDir(), '.pantoon-server.pid');

function ensureConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, yaml.dump({ rules: [] }, { indent: 2, lineWidth: -1 }));
  }
}

function isWindows() {
  return os.platform() === 'win32';
}

function getPortPid(port) {
  try {
    if (isWindows()) {
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
    } else {
      const output = execSync(`lsof -i :${port} -sTCP:LISTEN -t`, { encoding: 'utf8' });
      const pid = output.trim().split('\n')[0];
      if (pid) return pid;
    }
  } catch (e) {}
  return null;
}

function isPortListening(port) {
  try {
    if (isWindows()) {
      const out = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port}`], { encoding: 'utf8', shell: true }).stdout;
      return out && out.includes('LISTENING');
    } else {
      const result = spawnSync('lsof', ['-i', `:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
      return result.stdout && result.stdout.trim().length > 0;
    }
  } catch (e) {
    return false;
  }
}

function killPid(pid) {
  try {
    if (isWindows()) {
      execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' });
    } else {
      execSync(`kill -9 ${pid}`, { encoding: 'utf8' });
    }
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  getGlobalConfigDir, getConfigPath, CONFIG_PATH, PID_PATH, SERVER_PID_PATH,
  ensureConfig, isWindows, getPortPid, isPortListening, killPid
};

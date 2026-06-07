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
      const output = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
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
      const out = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port}`], { encoding: 'utf8', shell: true, windowsHide: true }).stdout;
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
      execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8', windowsHide: true, stdio: 'pipe' });
    } else {
      execSync(`kill -9 ${pid}`, { encoding: 'utf8' });
    }
    return true;
  } catch (e) {
    return false;
  }
}

function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

function normalizeIP(ip) {
  if (!ip) return '';
  // IPv6-mapped IPv4, e.g. ::ffff:10.0.0.1
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }
  return ip;
}

function ipToLong(ip) {
  const parts = ip.split('.');
  return ((parseInt(parts[0], 10) << 24) >>> 0) +
         ((parseInt(parts[1], 10) << 16) >>> 0) +
         ((parseInt(parts[2], 10) << 8) >>> 0) +
         (parseInt(parts[3], 10) >>> 0);
}

function matchCIDR(ip, cidr) {
  const [network, prefixStr] = cidr.split('/');
  const prefix = parseInt(prefixStr, 10);
  const mask = 0xFFFFFFFF << (32 - prefix);
  const ipLong = ipToLong(ip);
  const netLong = ipToLong(network);
  return (ipLong & mask) === (netLong & mask);
}

function isIPInWhitelist(ip, whitelist) {
  const normalized = normalizeIP(ip);
  // 默认放行本地回环地址
  if (normalized === '127.0.0.1' || ip === '::1') return true;
  if (!whitelist || whitelist.length === 0) return false;
  for (const entry of whitelist) {
    if (entry.includes('/')) {
      if (matchCIDR(normalized, entry)) return true;
    } else if (normalized === entry) {
      return true;
    }
  }
  return false;
}

module.exports = {
  getGlobalConfigDir, getConfigPath, CONFIG_PATH, PID_PATH, SERVER_PID_PATH,
  ensureConfig, isWindows, getPortPid, isPortListening, killPid, getLocalIPs,
  normalizeIP, isIPInWhitelist
};

const os = require('os');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

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

module.exports = { getGlobalConfigDir, getConfigPath, CONFIG_PATH, PID_PATH, SERVER_PID_PATH, ensureConfig };

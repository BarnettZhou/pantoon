const os = require('os');
const path = require('path');
const fs = require('fs');

function getConfigDir() {
  const platform = os.platform();
  let dir;
  if (platform === 'win32') {
    dir = path.join(process.env.USERPROFILE, 'AppData', '.pantoon');
  } else {
    dir = path.join(process.env.HOME, '.pantoon');
  }
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

const CONFIG_PATH = path.join(getConfigDir(), 'config.json');
const PID_PATH = path.join(getConfigDir(), '.pantoon.pid');

module.exports = { getConfigDir, CONFIG_PATH, PID_PATH };

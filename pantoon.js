#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const { CONFIG_PATH, getLocalIPs } = require('./core/paths');

function run(script, sync = false, args = []) {
  const scriptPath = path.join(__dirname, 'core', script);
  if (sync) {
    return spawnSync('node', [scriptPath, ...args], { stdio: 'inherit' });
  } else {
    const child = spawn('node', [scriptPath, ...args], { stdio: 'ignore', windowsHide: true, detached: true });
    child.unref();
    return child;
  }
}

function isRunning() {
  if (!fs.existsSync(CONFIG_PATH)) return false;
  try {
    const config = yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const proxies = config.rules || [];
    for (const rule of proxies) {
      const port = rule.listen || rule.port;
      try {
        const isWin = os.platform() === 'win32';
        let listening;
        if (isWin) {
          const result = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port}`], {
            encoding: 'utf8',
            shell: true,
          });
          listening = result.stdout && result.stdout.includes('LISTENING');
        } else {
          const result = spawnSync('lsof', ['-i', `:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
          listening = result.stdout && result.stdout.trim().length > 0;
        }
        if (listening) return true;
      } catch (e) {}
    }
  } catch (e) {}
  return false;
}

const cmd = process.argv[2];

switch (cmd) {
  case 'start': {
    if (isRunning()) {
      console.log('\n代理已在运行，如需重启请执行: pantoon restart\n');
      process.exit(1);
    }
    const withServer = process.argv.includes('-s') || process.argv.includes('--server');
    const detach = process.argv.includes('-d') || process.argv.includes('--detach');

    if (withServer) {
      console.log('\n🚀 启动代理 + 控制台...\n');
      run('server.js', false);
      const ips = getLocalIPs();
      const PORT = 11451;
      console.log('🖥️  控制台访问地址:');
      console.log(`   http://localhost:${PORT}/console`);
      ips.forEach(ip => console.log(`   http://${ip}:${PORT}/console`));
      console.log();
    } else {
      console.log('\n🚀 启动代理...\n');
    }

    run('proxy.js', !detach);

    if (detach) {
      console.log('代理已在后台运行');
      console.log('如需停止，执行: pantoon stop\n');
    }
    break;
  }
  case 'stop': {
    console.log('\n🛑 停止代理...\n');
    run('scripts/stop.js', true);
    break;
  }
  case 'restart': {
    console.log('\n🔄 重启代理...\n');
    run('scripts/stop.js', true);
    console.log('正在重新启动...\n');
    const detach = process.argv.includes('-d') || process.argv.includes('--detach');
    run('proxy.js', !detach);
    if (detach) {
      console.log('代理已在后台运行\n');
    }
    break;
  }
  case 'status': {
    run('scripts/status.js', true);
    break;
  }
  case 'scan': {
    run('scripts/discover.js', true);
    break;
  }
  case 'add': {
    const args = process.argv.slice(3);
    if (!args[0]) {
      console.log('\n用法: pantoon add <rule | ip-whitelist> ...\n');
      process.exit(1);
    }
    run('scripts/add.js', true, args);
    break;
  }
  case 'remove': {
    const args = process.argv.slice(3);
    if (!args[0]) {
      console.log('\n用法: pantoon remove <rule | ip-whitelist> ...\n');
      process.exit(1);
    }
    run('scripts/remove.js', true, args);
    break;
  }
  case 'list': {
    const args = process.argv.slice(3);
    if (!args[0]) {
      console.log('\n用法: pantoon list <rule | ip-whitelist>\n');
      process.exit(1);
    }
    run('scripts/list.js', true, args);
    break;
  }
  case 'server': {
    const detach = process.argv.includes('-d') || process.argv.includes('--detach');
    if (!detach) {
      console.log('\n🚀 启动 Web 控制台...\n');
    }
    run('server.js', !detach);
    if (detach) {
      const ips = getLocalIPs();
      const PORT = 11451;
      console.log('🖥️  控制台已在后台运行');
      console.log(`   http://localhost:${PORT}/console`);
      ips.forEach(ip => console.log(`   http://${ip}:${PORT}/console`));
      console.log();
    }
    break;
  }
  default: {
    console.log(`
用法: pantoon <命令>

命令:
  start    启动代理
  stop     关闭代理
  restart  重启代理
  status   查看运行状态
  scan     扫描外部域名并自动补全配置
  add      添加规则或白名单 IP
  remove   删除规则或白名单 IP
  list     列出规则或白名单 IP
  server   启动 Web 控制台

选项:
  -s, --server    同时启动 Web 控制台（仅 start 有效）
  -d, --detach    后台运行（仅 start / restart / server 有效）

示例:
  pantoon start -d                          后台启动代理
  pantoon start -s -d                       后台启动代理 + 控制台
  pantoon server -d                         后台启动控制台
  pantoon restart -d                        后台重启代理
  pantoon scan
  pantoon add rule --listen 18094 --target https://api.example.com
  pantoon add ip-whitelist 10.0.0.1
  pantoon remove rule 18094
  pantoon remove ip-whitelist 10.0.0.1
  pantoon list rule
  pantoon list ip-whitelist
`);
    process.exit(1);
  }
}

#!/usr/bin/env node
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const { CONFIG_PATH } = require('./core/paths');

function run(script, sync = false, args = []) {
  const scriptPath = path.join(__dirname, 'core', script);
  if (sync) {
    return spawnSync('node', [scriptPath, ...args], { stdio: 'inherit', shell: true });
  } else {
    return spawn('node', [scriptPath, ...args], { stdio: 'ignore', shell: true, windowsHide: true });
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
        const result = spawnSync('cmd', ['/c', `netstat -ano | findstr :${port}`], {
          encoding: 'utf8',
          shell: true,
        });
        if (result.stdout && result.stdout.includes('LISTENING')) return true;
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
    if (withServer) {
      console.log('\n🚀 启动代理 + 控制台...\n');
      run('server.js', false); // 后台启动控制台
      run('proxy.js', true);   // 前台启动代理
    } else {
      console.log('\n🚀 启动代理...\n');
      run('proxy.js', true);
    }
    break;
  }
  case 'stop': {
    console.log('\n🛑 停止代理...\n');
    run('stop.js', true);
    break;
  }
  case 'restart': {
    console.log('\n🔄 重启代理...\n');
    run('stop.js', true);
    console.log('正在重新启动...\n');
    run('proxy.js', true);
    break;
  }
  case 'status': {
    run('status.js', true);
    break;
  }
  case 'scan': {
    run('discover.js', true);
    break;
  }
  case 'add': {
    run('add.js', true, process.argv.slice(3));
    break;
  }
  case 'remove': {
    run('remove.js', true, process.argv.slice(3));
    break;
  }
  case 'server': {
    run('server.js', true);
    break;
  }
  default: {
    console.log(`
用法: pantoon <命令>

命令:
  start    启动代理（前台运行，Ctrl+C 停止）
  stop     关闭代理
  restart  重启代理
  status   查看运行状态
  scan     扫描外部域名并自动补全配置
  add      手动添加转发规则
  remove   删除转发规则
  server   启动 Web 控制台（前台运行）

示例:
  pantoon start
  pantoon start -s              同时启动代理 + Web 控制台
  pantoon server
  pantoon scan
  pantoon restart
  pantoon add --listen 18094 --target https://api.example.com
  pantoon remove --listen 18094
`);
    process.exit(1);
  }
}

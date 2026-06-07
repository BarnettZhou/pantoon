const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const yaml = require('js-yaml');
const { CONFIG_PATH, PID_PATH, SERVER_PID_PATH, ensureConfig, isPortListening, getLocalIPs, isIPInWhitelist, killPid } = require('./paths');

const PORT = 11451;

let ipWhitelist = [];
let configSnapshot = {};

function readConfig() {
  ensureConfig();
  return yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function normalizeRules(rules) {
  return JSON.stringify((rules || []).map(r => ({
    listen: r.listen,
    target: r.target
  })).sort((a, b) => a.listen - b.listen));
}

function isConfigChanged() {
  try {
    const current = readConfig();
    if (normalizeRules(current.rules) !== normalizeRules(configSnapshot.rules)) return true;
    const snapWL = JSON.stringify(configSnapshot['ip-whitelist'] || []);
    const currWL = JSON.stringify(current['ip-whitelist'] || []);
    return snapWL !== currWL;
  } catch (e) { return false; }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, yaml.dump(config, { indent: 2, lineWidth: -1 }));
}

function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // IP 白名单检查
  const clientIP = req.socket.remoteAddress;
  if (!isIPInWhitelist(clientIP, ipWhitelist)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden: IP not in whitelist' }));
    return;
  }

  // icon
  if (url.pathname === '/icon.svg' && req.method === 'GET') {
    try {
      const iconPath = path.join(__dirname, 'pages', 'icon.svg');
      const svg = fs.readFileSync(iconPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
      res.end(svg);
    } catch (e) {
      res.writeHead(404);
      res.end();
    }
    return;
  }

  // HTML 控制台
  if (url.pathname === '/console' && req.method === 'GET') {
    try {
      const htmlPath = path.join(__dirname, 'pages', 'console', 'index.html');
      const html = fs.readFileSync(htmlPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>Internal Server Error</h1><p>无法读取控制台页面: ' + e.message + '</p>');
    }
    return;
  }

  // JSON 状态（兼容旧 /status）
  if (url.pathname === '/status' && req.method === 'GET') {
    try {
      const config = readConfig();
      const rules = (config.rules || []).map(rule => ({
        listen: rule.listen,
        target: rule.target,
        running: isPortListening(rule.listen)
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'running', rules }, null, 2));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: 获取规则列表
  if (url.pathname === '/api/rules' && req.method === 'GET') {
    try {
      const config = readConfig();
      const rules = (config.rules || []).map(rule => ({
        listen: rule.listen,
        target: rule.target,
        running: isPortListening(rule.listen)
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ rules, configChanged: isConfigChanged() }, null, 2));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: 新增规则
  if (url.pathname === '/api/rules' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const port = parseInt(data.listen, 10);
        const target = data.target;
        if (!port || !target) throw new Error('缺少 listen 或 target');
        const parsed = new URL(target);
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('只支持 http:// 或 https://');

        const config = readConfig();
        const rules = config.rules || [];
        if (rules.some(r => r.listen === port)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '端口已被占用' }));
          return;
        }

        let name;
        try { name = parsed.host.replace(/\./g, '-'); } catch (e) { name = 'rule-' + (rules.length + 1); }
        rules.push({ name, listen: port, target });
        config.rules = rules;
        writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: 批量删除规则
  if (url.pathname === '/api/rules/batch-delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const ports = (data.ports || []).map(p => parseInt(p, 10));
        if (ports.length === 0) throw new Error('未选择任何端口');
        const config = readConfig();
        const rules = config.rules || [];
        const before = rules.length;
        config.rules = rules.filter(r => !ports.includes(r.listen));
        const removed = before - config.rules.length;
        writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, removed }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: 删除规则
  if (url.pathname.startsWith('/api/rules/') && req.method === 'DELETE') {
    try {
      const port = parseInt(url.pathname.replace('/api/rules/', ''), 10);
      const config = readConfig();
      const rules = config.rules || [];
      const before = rules.length;
      config.rules = rules.filter(r => r.listen !== port);
      if (config.rules.length === before) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '规则不存在' }));
        return;
      }
      writeConfig(config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: 获取 IP 白名单
  if (url.pathname === '/api/ip-whitelist' && req.method === 'GET') {
    try {
      const config = readConfig();
      const list = config['ip-whitelist'] || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ list, configChanged: isConfigChanged() }, null, 2));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: 新增 IP 白名单
  if (url.pathname === '/api/ip-whitelist' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const ip = data.ip;
        if (!ip) throw new Error('缺少 ip');

        const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
        const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
        if (!ipv4Regex.test(ip) && !cidrRegex.test(ip)) throw new Error('无效 IP 格式');
        const parts = ip.split('/')[0].split('.');
        for (const p of parts) {
          const n = parseInt(p, 10);
          if (isNaN(n) || n < 0 || n > 255) throw new Error('无效 IP 格式');
        }
        if (ip.includes('/')) {
          const prefix = parseInt(ip.split('/')[1], 10);
          if (prefix < 0 || prefix > 32) throw new Error('无效 CIDR 前缀');
        }

        const config = readConfig();
        const list = config['ip-whitelist'] || [];
        if (list.includes(ip)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'IP 已在白名单中' }));
          return;
        }
        list.push(ip);
        config['ip-whitelist'] = list;
        writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: 批量删除 IP 白名单
  if (url.pathname === '/api/ip-whitelist/batch-delete' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const ips = data.ips || [];
        if (ips.length === 0) throw new Error('未选择任何 IP');
        const config = readConfig();
        const list = config['ip-whitelist'] || [];
        const before = list.length;
        config['ip-whitelist'] = list.filter(entry => !ips.includes(entry));
        const removed = before - config['ip-whitelist'].length;
        writeConfig(config);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, removed }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: 删除 IP 白名单
  if (url.pathname.startsWith('/api/ip-whitelist/') && req.method === 'DELETE') {
    try {
      const ip = decodeURIComponent(url.pathname.replace('/api/ip-whitelist/', ''));
      const config = readConfig();
      const list = config['ip-whitelist'] || [];
      const before = list.length;
      config['ip-whitelist'] = list.filter(entry => entry !== ip);
      if (config['ip-whitelist'].length === before) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'IP 不存在' }));
        return;
      }
      writeConfig(config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // API: 重启代理
  if (url.pathname === '/api/restart' && req.method === 'POST') {
    try {
      // 1. 关闭现有代理进程（不杀控制台）
      if (fs.existsSync(PID_PATH)) {
        const proxyPid = fs.readFileSync(PID_PATH, 'utf8').trim();
        if (proxyPid) {
          try { killPid(proxyPid); } catch (e) {}
          try { fs.unlinkSync(PID_PATH); } catch (e) {}
        }
      }

      // 2. 启动新的代理（读取最新配置）
      const proxyPath = path.join(__dirname, 'proxy.js');
      spawn('node', [proxyPath], { detached: true, stdio: 'ignore', windowsHide: true }).unref();

      // 3. 控制台自己也重新加载配置
      const config = readConfig();
      configSnapshot = config;
      ipWhitelist = config['ip-whitelist'] || [];

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
}

const server = http.createServer(handleRequest);
server.listen(PORT, '0.0.0.0', () => {
  try {
    configSnapshot = readConfig();
    ipWhitelist = configSnapshot['ip-whitelist'] || [];
  } catch (e) {}
  fs.writeFileSync(SERVER_PID_PATH, process.pid.toString());
  const ips = getLocalIPs();
  console.log(`\n🖥️  控制台已启动`);
  console.log(`   Web 界面:`);
  console.log(`      http://localhost:${PORT}/console`);
  ips.forEach(ip => console.log(`      http://${ip}:${PORT}/console`));
  console.log(`   API 状态: http://localhost:${PORT}/status\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 控制台端口 ${PORT} 已被占用`);
  } else {
    console.error(`❌ 控制台服务器错误:`, err.message);
  }
});

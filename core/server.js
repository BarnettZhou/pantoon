const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync, spawn } = require('child_process');
const yaml = require('js-yaml');
const { CONFIG_PATH, SERVER_PID_PATH, ensureConfig, isPortListening } = require('./paths');

const PORT = 11451;

const HTML_PAGE = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pantoon Console</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; margin: 0; padding: 40px 20px; background: #f0f2f5; }
  .container { max-width: 960px; margin: 0 auto; }
  h1 { font-size: 28px; margin: 0 0 8px; color: #1f1f1f; }
  .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }
  .card { background: #fff; border-radius: 8px; padding: 24px; box-shadow: 0 1px 2px rgba(0,0,0,0.06); margin-bottom: 20px; }
  .toolbar { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .batch-info { margin-left: auto; font-size: 13px; color: #666; }
  .btn { padding: 8px 18px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; transition: opacity 0.15s; }
  .btn:hover { opacity: 0.85; }
  .btn-primary { background: #1677ff; color: #fff; }
  .btn-danger { background: #ff4d4f; color: #fff; }
  .btn-success { background: #52c41a; color: #fff; }
  .btn-default { background: #f0f0f0; color: #333; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { padding: 12px; text-align: left; border-bottom: 1px solid #f0f0f0; }
  th { background: #fafafa; font-weight: 600; color: #555; }
  tr:hover td { background: #fafafa; }
  .status-running { color: #52c41a; font-weight: 500; }
  .status-stopped { color: #999; }
  .target-text { max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: middle; }
  .empty { text-align: center; color: #999; padding: 40px; }
  .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.45); justify-content: center; align-items: center; z-index: 100; }
  .modal.show { display: flex; }
  .modal-box { background: #fff; border-radius: 8px; padding: 24px; width: 420px; max-width: 90%; box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
  .modal-box h3 { margin: 0 0 16px; font-size: 18px; }
  .form-group { margin-bottom: 16px; }
  .form-group label { display: block; margin-bottom: 6px; font-size: 14px; color: #555; font-weight: 500; }
  .form-group input { width: 100%; padding: 10px; border: 1px solid #d9d9d9; border-radius: 6px; font-size: 14px; }
  .form-group input:focus { outline: none; border-color: #1677ff; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 8px; }
  .toast { position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 6px; color: #fff; font-size: 14px; opacity: 0; transform: translateY(-10px); transition: all 0.3s; z-index: 200; }
  .toast.show { opacity: 1; transform: translateY(0); }
  .toast-ok { background: #52c41a; }
  .toast-err { background: #ff4d4f; }
</style>
</head>
<body>
<div class="container">
  <h1>Pantoon Console</h1>
  <div class="subtitle">端口转发控制台 — <span id="version"></span></div>

  <div class="card">
    <div class="toolbar">
      <button class="btn btn-primary" onclick="showAdd()">+ 新增规则</button>
      <button class="btn btn-danger" id="batchBtn" onclick="doBatchDelete()" style="display:none">批量删除</button>
      <button class="btn btn-success" onclick="doRestart()">🔄 重启代理</button>
      <button class="btn btn-default" onclick="loadData()">↻ 刷新</button>
      <span class="batch-info" id="batchInfo"></span>
    </div>
    <table>
      <thead>
        <tr><th style="width:40px"><input type="checkbox" id="checkAll" onclick="toggleAll()"></th><th>端口</th><th>目标地址</th><th>状态</th><th>操作</th></tr>
      </thead>
      <tbody id="tbody">
        <tr><td colspan="5" class="empty">加载中...</td></tr>
      </tbody>
    </table>
  </div>
</div>

<div class="modal" id="modal">
  <div class="modal-box">
    <h3>新增规则</h3>
    <div class="form-group">
      <label>监听端口</label>
      <input type="number" id="inputPort" placeholder="例如 18094">
    </div>
    <div class="form-group">
      <label>目标地址</label>
      <input type="text" id="inputTarget" placeholder="例如 https://api.example.com">
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="doAdd()">确定</button>
      <button class="btn btn-default" onclick="hideAdd()">取消</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const toastEl = document.getElementById('toast');
function toast(msg, ok) {
  toastEl.textContent = msg;
  toastEl.className = 'toast show ' + (ok ? 'toast-ok' : 'toast-err');
  setTimeout(() => toastEl.classList.remove('show'), 2500);
}
async function loadData() {
  try {
    const res = await fetch('/api/rules');
    const data = await res.json();
    const tbody = document.getElementById('tbody');
    if (!data.rules || data.rules.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty">暂无规则</td></tr>';
      return;
    }
    tbody.innerHTML = data.rules.map(r => {
      const statusClass = r.running ? 'status-running' : 'status-stopped';
      const statusText = r.running ? '运行中' : '未运行';
      return \`<tr>
        <td><input type="checkbox" class="row-check" value="\${r.listen}" onchange="updateBatchUI()"></td>
        <td>\${r.listen}</td>
        <td><span class="target-text" title="\${r.target}">\${r.target}</span></td>
        <td class="\${statusClass}">\${statusText}</td>
        <td>
          <button class="btn btn-primary" onclick="openRule(\${r.listen})">打开</button>
          <button class="btn btn-danger" onclick="doRemove(\${r.listen})">删除</button>
        </td>
      </tr>\`;
    }).join('');
    document.getElementById('checkAll').checked = false;
    updateBatchUI();
  } catch (e) {
    toast('加载失败: ' + e.message, false);
  }
}
async function doAdd() {
  const port = document.getElementById('inputPort').value.trim();
  const target = document.getElementById('inputTarget').value.trim();
  if (!port || !target) { toast('请填写完整信息', false); return; }
  try {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ listen: parseInt(port, 10), target })
    });
    const data = await res.json();
    if (!data.success) { toast(data.error || '添加失败', false); return; }
    hideAdd();
    toast('添加成功', true);
    loadData();
  } catch (e) {
    toast('添加失败: ' + e.message, false);
  }
}
async function doRemove(port) {
  if (!confirm('确认删除端口 ' + port + ' 的规则？')) return;
  try {
    const res = await fetch('/api/rules/' + port, { method: 'DELETE' });
    const data = await res.json();
    if (!data.success) { toast(data.error || '删除失败', false); return; }
    toast('删除成功', true);
    loadData();
  } catch (e) {
    toast('删除失败: ' + e.message, false);
  }
}
async function doRestart() {
  if (!confirm('确认重启代理？')) return;
  try {
    await fetch('/api/restart', { method: 'POST' });
    toast('重启指令已发送', true);
    setTimeout(loadData, 2000);
  } catch (e) {
    toast('重启失败: ' + e.message, false);
  }
}
function toggleAll() {
  const checked = document.getElementById('checkAll').checked;
  document.querySelectorAll('.row-check').forEach(cb => cb.checked = checked);
  updateBatchUI();
}
function getSelected() {
  return Array.from(document.querySelectorAll('.row-check:checked')).map(cb => parseInt(cb.value, 10));
}
function updateBatchUI() {
  const selected = getSelected();
  const btn = document.getElementById('batchBtn');
  const info = document.getElementById('batchInfo');
  if (selected.length > 0) {
    btn.style.display = 'inline-block';
    info.textContent = '已选 ' + selected.length + ' 项';
  } else {
    btn.style.display = 'none';
    info.textContent = '';
  }
}
async function doBatchDelete() {
  const ports = getSelected();
  if (ports.length === 0) return;
  if (!confirm('确认删除选中的 ' + ports.length + ' 条规则？')) return;
  try {
    const res = await fetch('/api/rules/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ports })
    });
    const data = await res.json();
    if (!data.success) { toast(data.error || '删除失败', false); return; }
    toast('已删除 ' + ports.length + ' 条规则', true);
    loadData();
  } catch (e) {
    toast('删除失败: ' + e.message, false);
  }
}
function openRule(port) {
  const host = window.location.hostname;
  window.open('http://' + host + ':' + port, '_blank');
}
function showAdd() { document.getElementById('modal').classList.add('show'); document.getElementById('inputPort').focus(); }
function hideAdd() { document.getElementById('modal').classList.remove('show'); document.getElementById('inputPort').value = ''; document.getElementById('inputTarget').value = ''; }
window.onclick = function(e) { if (e.target.id === 'modal') hideAdd(); };
loadData();
</script>
</body>
</html>`;

function readConfig() {
  ensureConfig();
  return yaml.load(fs.readFileSync(CONFIG_PATH, 'utf8'));
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

  // HTML 控制台
  if (url.pathname === '/console' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_PAGE);
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
      res.end(JSON.stringify({ rules }, null, 2));
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

  // API: 重启代理
  if (url.pathname === '/api/restart' && req.method === 'POST') {
    try {
      const pantoonPath = path.join(__dirname, '..', 'pantoon.js');
      spawnSync('node', [pantoonPath, 'stop']);
      const child = spawn('node', [pantoonPath, 'start'], { detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
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
  fs.writeFileSync(SERVER_PID_PATH, process.pid.toString());
  console.log(`\n🖥️  控制台已启动`);
  console.log(`   Web 界面: http://localhost:${PORT}/console`);
  console.log(`   API 状态: http://localhost:${PORT}/status\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ 控制台端口 ${PORT} 已被占用`);
  } else {
    console.error(`❌ 控制台服务器错误:`, err.message);
  }
});

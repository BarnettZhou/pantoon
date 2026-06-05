# Pantoon

一个零依赖的 Node.js 批量端口转发工具（跳板代理），用于将多个目标站点的流量统一转发到本地端口，供局域网内其他设备访问。

---

## 功能特性

- **零依赖**：仅使用 Node.js 内置模块，无需 `npm install`
- **批量转发**：一个配置文件管理任意多条转发规则
- **内容替换**：自动替换 HTML/JS/CSS 中的绝对路径域名，避免浏览器直连外网
- **外部域名发现**：自动扫描页面引用的跨域资源并补全转发规则
- **PID 文件管理**：启停不依赖配置文件内容，删改规则后仍能精准关闭进程
- **跨平台**：Windows、macOS、Linux 均支持

---

## 环境要求

- [Node.js](https://nodejs.org/)（建议 v16+）

---

## 安装

```bash
git clone <仓库地址> pantoon
cd pantoon
```

无需安装依赖，直接可用。

---

## 快速开始

```bash
# 启动代理
./pantoon start

# 查看状态
./pantoon status

# 停止代理
./pantoon stop
```

其他设备通过访问本机 IP 和对应端口即可使用代理，例如：

```
http://192.168.1.100:18080
```

---

## 命令列表

| 命令 | 说明 | 示例 |
|------|------|------|
| `start` | 启动代理（前台运行） | `./pantoon start` |
| `stop` | 关闭代理 | `./pantoon stop` |
| `restart` | 重启代理 | `./pantoon restart` |
| `status` | 查看当前转发状态 | `./pantoon status` |
| `scan` | 扫描外部域名并自动补全配置 | `./pantoon scan` |
| `add` | 手动添加转发规则 | `./pantoon add -l 18094 -t https://api.example.com` |
| `remove` | 删除转发规则 | `./pantoon remove -l 18094` |

> Windows CMD / PowerShell 下直接输入 `pantoon start`，Git Bash 下使用 `./pantoon start`。

---

## 配置文件

配置文件位于系统标准目录：

- **Windows**：`%USERPROFILE%\AppData\.pantoon\config.json`
- **macOS / Linux**：`~/.pantoon/config.json`

初始配置示例：

```json
{
  "proxies": [
    {
      "listen": 18080,
      "target": "https://redm.topcj.com"
    },
    {
      "listen": 18081,
      "target": "http://10.1.0.238:8000"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `listen` | 本机监听的端口 |
| `target` | 要转发的目标地址，支持 `http://` 和 `https://` |

---

## 内容替换机制

对于文本类型的响应（HTML/JS/CSS/JSON/XML），pantoon 会自动替换页面内的目标域名：

```
https://redm.topcj.com/xxx   →   http://192.168.1.100:18080/xxx
```

包括 URL 编码形式：

```
http%3A%2F%2Fredm.topcj.com   →   http%3A%2F%2F192.168.1.100:18080
```

---

## 外部域名发现

如果目标页面引用了其他域名的资源（CDN、第三方 API 等），这些请求会绕过跳板。使用 scan 命令自动发现并补全：

```bash
./pantoon scan
```

扫描后自动追加到 `config.json`，执行 `./pantoon restart` 生效。

> 提示：scan 会把所有引用域名都加进来（包括广告、统计脚本），建议检查后手动清理不需要的规则。

---

## 虚拟机部署

pantoon 完全可以在虚拟机中运行，宿主机通过网络访问虚拟机 IP 即可。

| 网络模式 | 访问方式 |
|---------|---------|
| **桥接模式** | 宿主机直接访问虚拟机 IP，如 `http://192.168.1.50:18080` |
| **NAT 模式** | 需在 VMware/VirtualBox 中配置端口转发，宿主机访问映射后的端口 |
| **WSL2** | Windows 宿主机可直接通过 `localhost:18080` 访问 |

---

## 项目结构

```
pantoon/
├── pantoon           # Git Bash 入口
├── pantoon.cmd       # Windows CMD 入口
├── pantoon.js        # 统一入口核心
├── README.md         # 本文档
├── proxy.log         # 运行日志
└── core/
    ├── paths.js      # 路径配置（跨平台标准目录）
    ├── proxy.js      # 代理服务
    ├── discover.js   # 扫描外部域名
    ├── add.js        # 添加规则
    ├── remove.js     # 删除规则
    ├── status.js     # 查看状态
    └── stop.js       # 关闭代理
```

---

## 注意事项

1. **端口占用**：启动前确保 `listen` 端口未被其他程序占用。
2. **防火墙**：如果局域网设备无法访问，请检查本机防火墙是否放行了对应端口。
3. **HTTPS 目标**：工具以 HTTP 方式监听，转发到 HTTPS 目标时会自动处理证书，返回给客户端的是明文 HTTP。
4. **内容替换局限**：JS 运行时动态计算的域名、WebSocket（`wss://`）等无法通过文本替换拦截，需要额外处理。

---

## License

MIT

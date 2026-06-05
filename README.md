# Pantoon

批量端口转发工具，把多个目标站点的流量转发到本地端口，供局域网内其他设备访问。

## 前提

- 安装 [Node.js](https://nodejs.org/)（建议 v16+）
- 执行 `npm install`

## 用法

```bash
# 启动代理（前台运行）
./pantoon start

# 同时启动代理 + Web 控制台
./pantoon start -s

# 单独启动 Web 控制台
./pantoon server

# 查看状态
./pantoon status

# 停止代理
./pantoon stop

# 重启代理
./pantoon restart

# 扫描页面引用的外部域名并自动补全配置
./pantoon scan

# 手动添加规则
./pantoon add -l 18094 -t https://api.example.com

# 删除规则
./pantoon remove -l 18094
```

> Windows CMD / PowerShell 下直接输入 `pantoon start`，Git Bash 下使用 `./pantoon start`。

启动后，其他设备通过 `http://<本机IP>:<端口>` 访问。

Web 控制台地址：`http://<本机IP>:11451/console`

## 配置文件

- **Windows**：`%USERPROFILE%\.pantoon\config.yaml`
- **macOS / Linux**：`~/.pantoon/config.yaml`

格式示例：

```yaml
rules:
  - name: example
    listen: 18080
    target: https://example.com
  - name: internal-api
    listen: 18081
    target: http://10.0.0.1:8080
```

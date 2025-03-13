# 网络请求诊断工具

一个简单的网络请求诊断工具，可以帮助分析视频链接的可访问性。

## 功能特点

- 支持检测视频链接的可访问性
- 纯前端实现，无需后端服务
- 简洁直观的用户界面

## 在线使用

访问 GitHub Pages 部署版本：https://your-username.github.io/network-diagnostic-tool

## 本地使用

1. 克隆仓库
```bash
git clone https://github.com/your-username/network-diagnostic-tool.git
cd network-diagnostic-tool
```

2. 使用任意HTTP服务器运行
```bash
# 使用Python的SimpleHTTPServer
python -m http.server

# 或使用Node.js的http-server
npx http-server
```

3. 在浏览器中访问 `http://localhost:8000`

## 部署到GitHub Pages

1. Fork 本仓库到你的GitHub账号下

2. 在仓库设置中启用GitHub Pages：
   - 进入仓库的Settings标签页
   - 找到Pages设置项
   - 在Source下选择main分支
   - 点击Save保存设置

3. 等待几分钟后，你的工具将会在以下地址可用：
   `https://your-username.github.io/network-diagnostic-tool`

## 贡献

欢迎提交Issue和Pull Request！

## 许可证

MIT License
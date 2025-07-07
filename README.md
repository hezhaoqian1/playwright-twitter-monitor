# Twitter 列表监控系统

一个基于 Playwright 的 Twitter 列表实时监控系统，可以自动检测新推文并在 Web 界面展示。

## ✨ 功能特点

- 🔄 **实时监控** - 自动定期检查 Twitter 列表更新
- 📅 **24小时推文** - 显示过去24小时内的所有推文
- 🎯 **新推文提醒** - 发现新推文时实时推送通知
- 💾 **数据持久化** - 自动保存推文历史记录
- 🌐 **Web 界面** - 美观的暗色主题界面
- 🔐 **登录保持** - 浏览器配置持久化，无需重复登录
- 🚫 **反检测** - 绕过 Twitter 的自动化检测

## 🖼️ 界面预览

- 暗色主题设计，与 Twitter 风格一致
- 实时显示推文统计和更新状态
- 支持导出推文数据

## 🚀 快速开始

### 环境要求

- Node.js 14+
- npm 或 yarn

### 安装

```bash
# 克隆项目
git clone https://github.com/yourusername/twitter-list-monitor.git
cd twitter-list-monitor

# 安装依赖
npm install
```

### 运行

```bash
# 启动监控服务
./start-monitor.sh
```

或者直接运行：

```bash
npm start
```

### 使用步骤

1. 打开浏览器访问 `http://localhost:3456`
2. 输入 Twitter 列表 URL（格式：`https://twitter.com/i/lists/xxxxx`）
3. 点击"开始监控"
4. 首次使用会弹出浏览器窗口，请登录你的 Twitter 账号
5. 系统会自动开始监控并显示推文

## 📋 配置选项

在 `server.js` 中可以修改：

```javascript
this.config = {
  port: 3456,           // Web 服务器端口
  wsPort: 3457,         // WebSocket 端口
  checkInterval: 30000, // 检查间隔（毫秒）
  dataFile: './tweets-data.json' // 数据文件路径
};
```

## 🏗️ 技术架构

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   前端界面   │ ←── │   WebSocket  │ ←── │  后端服务器  │
│  (HTML/JS)  │     │   实时通信    │     │  (Node.js)  │
└─────────────┘     └──────────────┘     └──────┬──────┘
                                                  │
                                          ┌───────▼────────┐
                                          │   Playwright   │
                                          │   浏览器控制    │
                                          └───────┬────────┘
                                                  │
                                          ┌───────▼────────┐
                                          │    Twitter     │
                                          │   列表页面      │
                                          └────────────────┘
```

## 📁 项目结构

```
twitter-list-monitor/
├── server.js           # 后端服务器
├── public/
│   └── index.html      # 前端界面
├── screenshots/        # 调试截图（自动生成）
├── twitter-profile/    # 浏览器配置（自动生成）
├── tweets-data.json    # 推文数据（自动生成）
├── package.json        # 项目配置
├── start-monitor.sh    # 启动脚本
├── README.md          # 本文档
└── 监控原理.md        # 技术原理说明
```

## 🛠️ 工作原理

1. 使用 Playwright 控制 Chromium 浏览器
2. 添加特殊参数绕过 Twitter 的自动化检测
3. 定期访问列表页面并提取推文数据
4. 通过 WebSocket 实时推送到前端
5. 本地存储推文数据

详细原理请查看 [监控原理.md](./监控原理.md)

## ⚠️ 注意事项

- 请勿频繁刷新，建议检查间隔不低于 30 秒
- 首次使用需要手动登录 Twitter
- 浏览器窗口会保持打开状态，请勿关闭
- 仅供学习研究使用，请遵守 Twitter 的使用条款

## 🐛 常见问题

### 无法检测到推文
- 检查浏览器窗口是否正常显示列表页面
- 查看 `screenshots` 目录下的截图
- 确认列表 URL 格式正确

### 端口被占用
- 修改 `server.js` 中的端口配置
- 或检查并停止占用端口的进程

### 登录状态丢失
- 删除 `twitter-profile` 目录
- 重新启动并登录

## 📄 开源协议

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

⚠️ **免责声明**：本项目仅供学习研究使用，使用者需自行承担相关风险。
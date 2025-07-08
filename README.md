# Twitter 列表监控系统

一个基于 Playwright 的 Twitter 列表实时监控系统，支持多列表管理、高级过滤和关键词高亮。

## ✨ 功能特点

### 基础功能
- 🔄 **实时监控** - 自动定期检查 Twitter 列表更新
- 📅 **24小时推文** - 显示过去24小时内的所有推文
- 🎯 **新推文提醒** - 发现新推文时实时推送通知
- 💾 **数据持久化** - 自动保存推文历史记录
- 🌐 **Web 界面** - 美观的暗色主题界面
- 🔐 **登录保持** - 浏览器配置持久化，无需重复登录
- 🚫 **反检测** - 绕过 Twitter 的自动化检测

### 高级功能（v2.0+）
- 📋 **多列表管理** - 同时监控多个 Twitter 列表
- 🔍 **智能过滤系统** - 全局和列表特定过滤规则
- ✨ **关键词高亮** - 实时高亮显示匹配的关键词
- 📊 **数据分析** - 推文统计和活跃度分析
- 🎯 **多种过滤类型** - 支持关键词、用户、正则表达式
- 🔄 **规则管理** - 启用/禁用过滤规则，灵活控制
- 📥 **数据导出** - 导出推文和过滤规则数据
- ⚡ **快速过滤** - 实时搜索框快速过滤推文

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

有三种版本可选：

#### 1. 基础版（单列表）
```bash
./start-monitor.sh
# 或
npm start
```

#### 2. 多列表版
```bash
./start-multi.sh
# 或
npm run start:multi
```

#### 3. 高级版（推荐）
```bash
./start-advanced.sh
# 或
npm run start:advanced
```

访问 `http://localhost:3456` 打开界面

### 使用步骤

#### 基础版
1. 打开浏览器访问 `http://localhost:3456`
2. 输入 Twitter 列表 URL（格式：`https://twitter.com/i/lists/xxxxx`）
3. 点击"开始监控"
4. 首次使用会弹出浏览器窗口，请登录你的 Twitter 账号
5. 系统会自动开始监控并显示推文

#### 高级版（推荐）
1. 启动服务器后访问 `http://localhost:3456`
2. 点击"添加列表"按钮，输入列表 URL
3. 可以添加多个列表进行同时监控
4. 点击"过滤规则"管理过滤条件：
   - **全局规则**：应用于所有列表
   - **列表规则**：仅应用于特定列表
   - **过滤类型**：关键词、用户、正则表达式
   - **过滤模式**：包含（只显示匹配）或排除（隐藏匹配）
5. 使用顶部搜索框进行快速过滤，关键词会高亮显示
6. 点击"数据分析"查看推文统计
7. 点击"导出数据"保存推文和过滤规则

## 📋 配置选项

在服务器文件中可以修改：

```javascript
this.config = {
  port: 3456,           // Web 服务器端口
  wsPort: 3457,         // WebSocket 端口
  checkInterval: 30000, // 检查间隔（毫秒）
  dataFile: './monitor-data.json' // 数据文件路径
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
├── server.js              # 基础版服务器
├── server-multi.js        # 多列表版服务器
├── server-advanced.js     # 高级版服务器（含过滤系统）
├── public/
│   ├── index.html         # 基础版前端
│   ├── index-multi.html   # 多列表版前端
│   └── index-advanced.html # 高级版前端
├── screenshots/           # 调试截图（自动生成）
├── twitter-profile/       # 浏览器配置（自动生成）
├── monitor-data.json      # 数据存储文件（自动生成）
├── package.json           # 项目配置
├── start-monitor.sh       # 基础版启动脚本
├── start-multi.sh         # 多列表版启动脚本
├── start-advanced.sh      # 高级版启动脚本
├── README.md             # 本文档
└── 监控原理.md           # 技术原理说明
```

## 🛠️ 工作原理

1. 使用 Playwright 控制 Chromium 浏览器
2. 添加特殊参数绕过 Twitter 的自动化检测
3. 定期访问列表页面并提取推文数据
4. 通过 WebSocket 实时推送到前端
5. 本地存储推文数据

详细原理请查看 [监控原理.md](./监控原理.md)

## 🔌 API 端点

### 列表管理
- `GET /api/lists` - 获取所有列表
- `POST /api/lists` - 添加新列表
- `DELETE /api/lists/:id` - 删除列表
- `PUT /api/lists/:id` - 更新列表信息

### 监控控制
- `POST /api/lists/:id/monitor/start` - 开始监控
- `POST /api/lists/:id/monitor/stop` - 停止监控

### 推文管理
- `GET /api/lists/:id/tweets` - 获取列表推文（支持过滤参数）
- `POST /api/lists/:id/tweets/clear` - 清空推文

### 过滤规则（高级版）
- `GET /api/filters` - 获取所有过滤规则
- `POST /api/filters` - 添加过滤规则
- `PUT /api/filters/:id` - 更新过滤规则（启用/禁用）
- `DELETE /api/filters/:id` - 删除过滤规则

### 系统状态
- `GET /api/status` - 获取系统状态信息

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
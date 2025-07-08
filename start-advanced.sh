#!/bin/bash

echo "Twitter 高级列表监控系统"
echo "========================"
echo ""

# 检查 node 是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 需要安装 Node.js"
    exit 1
fi

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 安装依赖..."
    npm install
fi

# 创建浏览器配置目录
if [ ! -d "./twitter-profile" ]; then
    echo "📁 创建浏览器配置目录..."
    mkdir -p ./twitter-profile
fi

# 创建截图目录
if [ ! -d "./screenshots" ]; then
    echo "📁 创建截图目录..."
    mkdir -p ./screenshots
fi

echo ""
echo "🚀 启动高级监控服务器..."
echo ""
echo "📱 前端界面: http://localhost:3456"
echo "🔌 WebSocket: ws://localhost:3457"
echo ""
echo "使用说明："
echo "1. 打开 http://localhost:3456"
echo "2. 点击'添加列表'添加要监控的 Twitter 列表"
echo "3. 点击'过滤规则'管理全局和列表特定的过滤规则"
echo "4. 使用快速过滤栏实时过滤推文"
echo "5. 首次使用需要在弹出的浏览器中登录 Twitter"
echo ""
echo "高级功能："
echo "✨ 多列表同时监控"
echo "✨ 关键词高亮显示"
echo "✨ 全局和列表特定过滤规则"
echo "✨ 支持关键词、用户、正则表达式过滤"
echo "✨ 实时数据分析面板"
echo "✨ 推文数据导出功能"
echo "✨ 过滤规则启用/禁用切换"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 使用高级服务器
node server-advanced.js &
SERVER_PID=$!

# 等待服务器启动
sleep 2

# 创建符号链接，让 /index.html 指向高级版本
cd public
ln -sf index-advanced.html index.html
cd ..

# 等待服务器进程
wait $SERVER_PID
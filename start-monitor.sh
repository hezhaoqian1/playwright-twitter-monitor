#!/bin/bash

echo "Twitter 列表监控系统"
echo "=================="
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

echo ""
echo "🚀 启动服务器..."
echo ""
echo "📱 前端界面: http://localhost:3456"
echo "🔌 WebSocket: ws://localhost:3457"
echo ""
echo "使用说明："
echo "1. 打开 http://localhost:3456"
echo "2. 输入 Twitter 列表 URL"
echo "3. 点击'开始监控'"
echo "4. 首次使用需要在弹出的浏览器中登录 Twitter"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 启动服务器
node server.js
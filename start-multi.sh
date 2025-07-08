#!/bin/bash

echo "Twitter 多列表监控系统"
echo "====================="
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
echo "🚀 启动多列表监控服务器..."
echo ""
echo "📱 前端界面: http://localhost:3456"
echo "🔌 WebSocket: ws://localhost:3457"
echo ""
echo "使用说明："
echo "1. 打开 http://localhost:3456"
echo "2. 点击'添加列表'添加要监控的 Twitter 列表"
echo "3. 可以同时监控多个列表"
echo "4. 首次使用需要在弹出的浏览器中登录 Twitter"
echo ""
echo "新功能："
echo "✨ 支持同时监控多个列表"
echo "✨ 列表管理（添加/删除）"
echo "✨ 独立控制每个列表的监控状态"
echo "✨ 优化的界面设计"
echo ""
echo "按 Ctrl+C 停止服务器"
echo ""

# 使用新的多列表服务器，并将输出重定向到单独的 HTML 文件
node server-multi.js &
SERVER_PID=$!

# 等待服务器启动
sleep 2

# 创建符号链接，让 /index.html 指向多列表版本
cd public
ln -sf index-multi.html index.html
cd ..

# 等待服务器进程
wait $SERVER_PID
const express = require('express');
const { chromium } = require('playwright');
const WebSocket = require('ws');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');

class TwitterMonitorServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.wss = null;
    this.browser = null;
    this.page = null;
    this.clients = new Set();
    this.tweets = new Map();
    this.monitoringActive = false;
    this.config = {
      port: process.env.PORT || 3456,
      wsPort: process.env.WS_PORT || 3457,
      checkInterval: 30000, // 30秒
      dataFile: './tweets-data.json'
    };
  }

  async init() {
    // 设置 Express
    this.app.use(express.static('public'));
    this.app.use(express.json());

    // API 路由
    this.app.get('/api/tweets', (req, res) => {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const tweets = Array.from(this.tweets.values())
        .filter(tweet => {
          // 过滤24小时内的推文
          if (tweet.tweetTime) {
            const tweetTime = new Date(tweet.tweetTime);
            return tweetTime >= twentyFourHoursAgo;
          }
          return true;
        })
        .sort((a, b) => {
          const timeA = new Date(a.tweetTime || a.timestamp);
          const timeB = new Date(b.tweetTime || b.timestamp);
          return timeB - timeA;
        });
      res.json(tweets);
    });

    this.app.get('/api/status', (req, res) => {
      res.json({
        monitoring: this.monitoringActive,
        tweetsCount: this.tweets.size,
        connectedClients: this.clients.size,
        currentList: this.currentListUrl || null
      });
    });

    this.app.post('/api/monitor/start', async (req, res) => {
      const { listUrl } = req.body;
      if (!listUrl) {
        return res.status(400).json({ error: '需要提供列表 URL' });
      }
      
      try {
        await this.startMonitoring(listUrl);
        res.json({ success: true, message: '开始监控' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/monitor/stop', (req, res) => {
      this.stopMonitoring();
      res.json({ success: true, message: '停止监控' });
    });

    // 清空推文
    this.app.post('/api/tweets/clear', async (req, res) => {
      this.tweets.clear();
      await this.saveData();
      this.broadcast({ type: 'tweets_cleared' });
      res.json({ success: true, message: '已清空推文' });
    });

    // 导出推文
    this.app.get('/api/tweets/export', (req, res) => {
      const tweets = Array.from(this.tweets.values())
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="tweets-export.json"');
      res.json({
        exportTime: new Date().toISOString(),
        listUrl: this.currentListUrl,
        tweetsCount: tweets.length,
        tweets: tweets
      });
    });

    // 启动 HTTP 服务器
    this.server = this.app.listen(this.config.port, () => {
      console.log(`✅ 服务器运行在 http://localhost:${this.config.port}`);
    });

    // 设置 WebSocket
    this.wss = new WebSocket.Server({ port: this.config.wsPort });
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log('🔌 新客户端连接 (当前连接数:', this.clients.size + ')');
      
      // 发送现有推文和状态
      ws.send(JSON.stringify({
        type: 'initial',
        tweets: Array.from(this.tweets.values()),
        status: {
          monitoring: this.monitoringActive,
          currentList: this.currentListUrl
        }
      }));

      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('🔌 客户端断开连接 (当前连接数:', this.clients.size + ')');
      });

      ws.on('error', (error) => {
        console.error('WebSocket 错误:', error);
      });
    });

    console.log(`✅ WebSocket 服务器运行在 ws://localhost:${this.config.wsPort}`);

    // 加载已保存的数据
    await this.loadData();
  }

  async startBrowser() {
    if (this.browser) return;
    
    console.log('🌐 启动浏览器...');
    try {
      this.browser = await chromium.launchPersistentContext('./twitter-profile', {
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
        viewport: { width: 1280, height: 800 }
      });
      
      this.page = this.browser.pages()[0] || await this.browser.newPage();
      console.log('✅ 浏览器启动成功');
    } catch (error) {
      console.error('❌ 浏览器启动失败:', error);
      throw error;
    }
  }

  async startMonitoring(listUrl) {
    if (this.monitoringActive) {
      throw new Error('监控已在运行');
    }

    await this.startBrowser();
    this.monitoringActive = true;
    this.currentListUrl = listUrl;

    console.log(`🔍 开始监控: ${listUrl}`);
    this.broadcast({ type: 'monitoring_started', listUrl });
    
    // 立即检查一次
    await this.checkForNewTweets();
    
    // 监控循环
    this.monitorInterval = setInterval(async () => {
      if (!this.monitoringActive) {
        clearInterval(this.monitorInterval);
        return;
      }
      
      try {
        await this.checkForNewTweets();
      } catch (error) {
        console.error('❌ 监控错误:', error);
        this.broadcast({ 
          type: 'error', 
          message: '检查推文时出错: ' + error.message 
        });
      }
    }, this.config.checkInterval);
  }

  async checkForNewTweets() {
    const checkTime = new Date().toLocaleTimeString();
    console.log(`\n[${checkTime}] 检查更新...`);
    
    try {
      await this.page.goto(this.currentListUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // 等待推文容器加载
      try {
        await this.page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 10000 });
      } catch (e) {
        console.log('⚠️  等待推文容器超时，尝试继续...');
      }
      
      // 等待推文加载
      await this.page.waitForTimeout(5000);
      
      // 滚动页面以加载更多推文
      await this.page.evaluate(() => {
        window.scrollBy(0, 500);
      });
      await this.page.waitForTimeout(2000);
      
      // 再次滚动以确保加载更多历史推文
      await this.page.evaluate(() => {
        window.scrollBy(0, 1000);
      });
      await this.page.waitForTimeout(3000);
      
      // 确保 screenshots 目录存在
      const screenshotsDir = path.join(__dirname, 'screenshots');
      if (!fsSync.existsSync(screenshotsDir)) {
        fsSync.mkdirSync(screenshotsDir, { recursive: true });
      }
      
      // 调试：截图保存
      const debugScreenshot = await this.page.screenshot({ 
        path: path.join(screenshotsDir, `debug-${Date.now()}.png`),
        fullPage: false 
      });
      console.log('📸 已保存调试截图到 screenshots 目录');
      
      const tweets = await this.page.evaluate(() => {
        // 尝试多种选择器
        let tweetElements = document.querySelectorAll('[data-testid="tweet"]');
        console.log(`找到 ${tweetElements.length} 个推文元素`);
        
        if (tweetElements.length === 0) {
          // 尝试其他选择器
          tweetElements = document.querySelectorAll('article[role="article"]');
          console.log(`使用备用选择器找到 ${tweetElements.length} 个推文元素`);
        }
        
        const results = [];
        
        tweetElements.forEach((tweet, index) => {
          if (index > 20) return; // 只检查最新的20条
          
          // 尝试多种文本选择器
          let textElement = tweet.querySelector('[data-testid="tweetText"]');
          if (!textElement) {
            textElement = tweet.querySelector('[lang]');
          }
          
          const userNameElement = tweet.querySelector('[data-testid="User-Name"] a') || 
                                 tweet.querySelector('a[role="link"] span');
          const timeElement = tweet.querySelector('time');
          const linkElements = tweet.querySelectorAll('a[href*="/status/"]');
          
          // 查找正确的状态链接
          let statusLink = null;
          for (const link of linkElements) {
            if (link.href.includes('/status/') && !link.href.includes('/photo/')) {
              statusLink = link.href;
              break;
            }
          }
          
          if (textElement && textElement.innerText) {
            const userNameText = userNameElement ? userNameElement.innerText : '';
            const [userName, userHandle] = userNameText.includes('\n') 
              ? userNameText.split('\n') 
              : [userNameText, '@unknown'];
            
            const tweetData = {
              text: textElement.innerText,
              userName: userName || 'Unknown',
              userHandle: userHandle || '@unknown',
              time: timeElement ? timeElement.getAttribute('datetime') : null,
              link: statusLink
            };
            
            console.log(`推文 ${index + 1}:`, tweetData.userName, '-', tweetData.text.substring(0, 50));
            results.push(tweetData);
          }
        });
        
        return results;
      });

      console.log(`📊 找到 ${tweets.length} 条推文`);
      
      // 过滤24小时内的推文
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const recentTweets = tweets.filter(tweet => {
        if (tweet.time) {
          const tweetTime = new Date(tweet.time);
          return tweetTime >= twentyFourHoursAgo;
        }
        return true; // 如果没有时间信息，默认包含
      });
      
      console.log(`📅 过去24小时内的推文: ${recentTweets.length} 条`);
      
      let newCount = 0;
      const allTweetsToSend = [];
      
      for (const tweet of recentTweets) {
        // 使用更可靠的ID生成方式
        const tweetId = tweet.link 
          ? tweet.link.split('/status/')[1] 
          : `${tweet.userHandle}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        if (!this.tweets.has(tweetId)) {
          newCount++;
          const tweetData = {
            id: tweetId,
            ...tweet,
            timestamp: new Date().toISOString(),
            isNew: true,
            tweetTime: tweet.time // 保留原始推文时间
          };
          
          this.tweets.set(tweetId, tweetData);
          allTweetsToSend.push(tweetData);
          
          console.log(`🆕 新推文: @${tweet.userHandle}: ${tweet.text.substring(0, 50)}...`);
        } else {
          // 也包含已存在的24小时内的推文
          const existingTweet = this.tweets.get(tweetId);
          existingTweet.isNew = false; // 标记为非新推文
          allTweetsToSend.push(existingTweet);
        }
      }
      
      if (newCount > 0) {
        await this.saveData();
      }
      
      // 发送所有24小时内的推文
      this.broadcast({
        type: 'all_recent_tweets',
        tweets: allTweetsToSend,
        newCount: newCount,
        totalCount: allTweetsToSend.length
      });
      
      if (newCount > 0) {
        console.log(`✨ 发现 ${newCount} 条新推文！`);
      } else {
        console.log('💤 没有新推文');
      }
      console.log(`📊 24小时内总计 ${allTweetsToSend.length} 条推文`);
      
      // 发送心跳
      this.broadcast({
        type: 'heartbeat',
        lastCheck: new Date().toISOString(),
        tweetsCount: this.tweets.size,
        recentTweetsCount: allTweetsToSend.length
      });
      
    } catch (error) {
      console.error('❌ 检查推文失败:', error.message);
      throw error;
    }
  }

  broadcast(data) {
    const message = JSON.stringify(data);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  stopMonitoring() {
    this.monitoringActive = false;
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.broadcast({ type: 'monitoring_stopped' });
    console.log('🛑 停止监控');
  }

  async loadData() {
    try {
      const data = await fs.readFile(this.config.dataFile, 'utf8');
      const savedData = JSON.parse(data);
      
      if (savedData.tweets) {
        savedData.tweets.forEach(tweet => {
          this.tweets.set(tweet.id, tweet);
        });
      }
      
      if (savedData.currentListUrl) {
        this.currentListUrl = savedData.currentListUrl;
      }
      
      console.log(`📂 加载了 ${this.tweets.size} 条历史推文`);
    } catch (error) {
      console.log('📂 没有找到历史数据文件，将创建新文件');
    }
  }

  async saveData() {
    const data = {
      tweets: Array.from(this.tweets.values()),
      currentListUrl: this.currentListUrl,
      lastSave: new Date().toISOString()
    };
    
    await fs.writeFile(this.config.dataFile, JSON.stringify(data, null, 2));
  }

  async close() {
    this.stopMonitoring();
    
    if (this.browser) {
      await this.browser.close();
    }
    
    if (this.server) {
      this.server.close();
    }
    
    if (this.wss) {
      this.wss.close();
    }
    
    await this.saveData();
    console.log('👋 服务器已关闭');
  }
}

// 启动服务器
const server = new TwitterMonitorServer();

server.init().catch(error => {
  console.error('❌ 服务器启动失败:', error);
  process.exit(1);
});

// 优雅关闭
process.on('SIGINT', async () => {
  console.log('\n🛑 正在关闭服务器...');
  await server.close();
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('❌ 未捕获的异常:', error);
  server.close().then(() => process.exit(1));
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ 未处理的 Promise 拒绝:', reason);
});
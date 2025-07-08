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
    this.clients = new Set();
    
    // 多列表支持
    this.lists = new Map(); // 存储所有列表配置
    this.listMonitors = new Map(); // 每个列表的监控状态
    this.tweets = new Map(); // 按列表ID存储推文
    
    // 关键词过滤系统
    this.filters = new Map(); // 存储过滤规则
    this.globalFilters = []; // 全局过滤规则
    
    this.config = {
      port: process.env.PORT || 3456,
      wsPort: process.env.WS_PORT || 3457,
      checkInterval: 30000, // 30秒
      dataFile: './monitor-data.json'
    };
  }

  async init() {
    // 设置 Express
    this.app.use(express.static('public'));
    this.app.use(express.json());

    // API 路由
    
    // 获取所有列表
    this.app.get('/api/lists', (req, res) => {
      const lists = Array.from(this.lists.values()).map(list => ({
        ...list,
        filters: this.filters.get(list.id) || []
      }));
      res.json(lists);
    });
    
    // 添加新列表
    this.app.post('/api/lists', async (req, res) => {
      const { url, name } = req.body;
      if (!url) {
        return res.status(400).json({ error: '需要提供列表 URL' });
      }
      
      const listIdMatch = url.match(/lists\/(\d+)/);
      if (!listIdMatch) {
        return res.status(400).json({ error: '无效的列表 URL' });
      }
      
      const listId = listIdMatch[1];
      
      if (this.lists.has(listId)) {
        return res.status(409).json({ error: '列表已存在' });
      }
      
      const list = {
        id: listId,
        url,
        name: name || `列表 ${listId}`,
        addedAt: new Date().toISOString(),
        isActive: false,
        tweetsCount: 0
      };
      
      this.lists.set(listId, list);
      this.tweets.set(listId, new Map());
      this.filters.set(listId, []); // 初始化过滤规则
      await this.saveData();
      
      res.json(list);
    });
    
    // 删除列表
    this.app.delete('/api/lists/:id', async (req, res) => {
      const { id } = req.params;
      
      if (!this.lists.has(id)) {
        return res.status(404).json({ error: '列表不存在' });
      }
      
      await this.stopMonitoringList(id);
      
      this.lists.delete(id);
      this.tweets.delete(id);
      this.filters.delete(id);
      await this.saveData();
      
      res.json({ success: true });
    });
    
    // 更新列表
    this.app.put('/api/lists/:id', async (req, res) => {
      const { id } = req.params;
      const { name } = req.body;
      
      if (!this.lists.has(id)) {
        return res.status(404).json({ error: '列表不存在' });
      }
      
      const list = this.lists.get(id);
      if (name) list.name = name;
      
      await this.saveData();
      res.json(list);
    });
    
    // 获取某个列表的推文（支持过滤）
    this.app.get('/api/lists/:id/tweets', (req, res) => {
      const { id } = req.params;
      const { filter, keywords } = req.query;
      
      if (!this.tweets.has(id)) {
        return res.status(404).json({ error: '列表不存在' });
      }
      
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      let listTweets = Array.from(this.tweets.get(id).values())
        .filter(tweet => {
          if (tweet.tweetTime) {
            const tweetTime = new Date(tweet.tweetTime);
            return tweetTime >= twentyFourHoursAgo;
          }
          return true;
        });
      
      // 应用关键词过滤
      if (filter === 'true' && keywords) {
        const keywordList = keywords.split(',').map(k => k.trim().toLowerCase());
        listTweets = listTweets.filter(tweet => {
          const text = tweet.text.toLowerCase();
          return keywordList.some(keyword => text.includes(keyword));
        });
      }
      
      // 应用列表特定的过滤规则
      const listFilters = this.filters.get(id) || [];
      if (listFilters.length > 0) {
        listTweets = this.applyFilters(listTweets, listFilters);
      }
      
      // 应用全局过滤规则
      if (this.globalFilters.length > 0) {
        listTweets = this.applyFilters(listTweets, this.globalFilters);
      }
      
      listTweets.sort((a, b) => {
        const timeA = new Date(a.tweetTime || a.timestamp);
        const timeB = new Date(b.tweetTime || b.timestamp);
        return timeB - timeA;
      });
      
      res.json(listTweets);
    });
    
    // 过滤规则管理
    
    // 获取过滤规则
    this.app.get('/api/filters', (req, res) => {
      const filters = {
        global: this.globalFilters,
        lists: {}
      };
      
      this.filters.forEach((value, key) => {
        filters.lists[key] = value;
      });
      
      res.json(filters);
    });
    
    // 添加过滤规则
    this.app.post('/api/filters', async (req, res) => {
      const { listId, rule } = req.body;
      
      if (!rule || !rule.type || !rule.value) {
        return res.status(400).json({ error: '无效的过滤规则' });
      }
      
      rule.id = Date.now().toString();
      rule.createdAt = new Date().toISOString();
      
      if (listId === 'global') {
        this.globalFilters.push(rule);
      } else {
        if (!this.filters.has(listId)) {
          this.filters.set(listId, []);
        }
        this.filters.get(listId).push(rule);
      }
      
      await this.saveData();
      res.json(rule);
    });
    
    // 删除过滤规则
    this.app.delete('/api/filters/:ruleId', async (req, res) => {
      const { ruleId } = req.params;
      const { listId } = req.query;
      
      if (listId === 'global') {
        this.globalFilters = this.globalFilters.filter(r => r.id !== ruleId);
      } else if (this.filters.has(listId)) {
        const rules = this.filters.get(listId);
        this.filters.set(listId, rules.filter(r => r.id !== ruleId));
      }
      
      await this.saveData();
      res.json({ success: true });
    });
    
    // 更新过滤规则
    this.app.put('/api/filters/:ruleId', async (req, res) => {
      const { ruleId } = req.params;
      const { listId, enabled } = req.body;
      
      let rules;
      if (listId === 'global') {
        rules = this.globalFilters;
      } else if (this.filters.has(listId)) {
        rules = this.filters.get(listId);
      }
      
      if (rules) {
        const rule = rules.find(r => r.id === ruleId);
        if (rule) {
          rule.enabled = enabled;
          await this.saveData();
          res.json(rule);
          return;
        }
      }
      
      res.status(404).json({ error: '规则不存在' });
    });
    
    // 开始监控某个列表
    this.app.post('/api/lists/:id/monitor/start', async (req, res) => {
      const { id } = req.params;
      
      if (!this.lists.has(id)) {
        return res.status(404).json({ error: '列表不存在' });
      }
      
      try {
        await this.startMonitoringList(id);
        res.json({ success: true, message: '开始监控' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // 停止监控某个列表
    this.app.post('/api/lists/:id/monitor/stop', async (req, res) => {
      const { id } = req.params;
      
      try {
        await this.stopMonitoringList(id);
        res.json({ success: true, message: '停止监控' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // 清空某个列表的推文
    this.app.post('/api/lists/:id/tweets/clear', async (req, res) => {
      const { id } = req.params;
      
      if (!this.tweets.has(id)) {
        return res.status(404).json({ error: '列表不存在' });
      }
      
      this.tweets.get(id).clear();
      await this.saveData();
      this.broadcast({ type: 'tweets_cleared', listId: id });
      res.json({ success: true, message: '已清空推文' });
    });

    // 获取状态
    this.app.get('/api/status', (req, res) => {
      const lists = Array.from(this.lists.values()).map(list => ({
        ...list,
        tweetsCount: this.tweets.get(list.id)?.size || 0,
        isActive: this.listMonitors.has(list.id)
      }));
      
      res.json({
        lists,
        activeMonitors: this.listMonitors.size,
        connectedClients: this.clients.size,
        browserActive: !!this.browser
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
      
      // 发送初始数据
      ws.send(JSON.stringify({
        type: 'initial',
        lists: Array.from(this.lists.values()),
        activeMonitors: Array.from(this.listMonitors.keys()),
        filters: {
          global: this.globalFilters,
          lists: Object.fromEntries(this.filters)
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

  // 应用过滤规则
  applyFilters(tweets, filters) {
    const activeFilters = filters.filter(f => f.enabled !== false);
    if (activeFilters.length === 0) return tweets;
    
    return tweets.filter(tweet => {
      for (const filter of activeFilters) {
        const text = tweet.text.toLowerCase();
        const value = filter.value.toLowerCase();
        
        switch (filter.type) {
          case 'keyword':
            if (filter.mode === 'exclude') {
              if (text.includes(value)) return false;
            } else {
              if (!text.includes(value)) return false;
            }
            break;
            
          case 'user':
            const userHandle = tweet.userHandle.toLowerCase();
            if (filter.mode === 'exclude') {
              if (userHandle === value || userHandle === `@${value}`) return false;
            } else {
              if (userHandle !== value && userHandle !== `@${value}`) return false;
            }
            break;
            
          case 'regex':
            try {
              const regex = new RegExp(filter.value, 'i');
              if (filter.mode === 'exclude') {
                if (regex.test(tweet.text)) return false;
              } else {
                if (!regex.test(tweet.text)) return false;
              }
            } catch (e) {
              console.error('Invalid regex:', filter.value);
            }
            break;
        }
      }
      
      return true;
    });
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
      
      console.log('✅ 浏览器启动成功');
    } catch (error) {
      console.error('❌ 浏览器启动失败:', error);
      throw error;
    }
  }

  async startMonitoringList(listId) {
    const list = this.lists.get(listId);
    if (!list) {
      throw new Error('列表不存在');
    }
    
    if (this.listMonitors.has(listId)) {
      throw new Error('该列表已在监控中');
    }
    
    await this.startBrowser();
    
    // 创建新页面
    const page = await this.browser.newPage();
    
    const monitor = {
      listId,
      page,
      interval: null,
      isActive: true
    };
    
    this.listMonitors.set(listId, monitor);
    list.isActive = true;
    
    console.log(`🔍 开始监控列表: ${list.name} (${list.url})`);
    this.broadcast({ 
      type: 'monitoring_started', 
      listId,
      list 
    });
    
    // 立即检查一次
    await this.checkListForNewTweets(listId);
    
    // 设置定期检查
    monitor.interval = setInterval(async () => {
      if (monitor.isActive) {
        try {
          await this.checkListForNewTweets(listId);
        } catch (error) {
          console.error(`❌ 监控列表 ${list.name} 时出错:`, error);
          this.broadcast({ 
            type: 'error', 
            listId,
            message: '检查推文时出错: ' + error.message 
          });
        }
      }
    }, this.config.checkInterval);
  }

  async stopMonitoringList(listId) {
    const monitor = this.listMonitors.get(listId);
    if (!monitor) return;
    
    monitor.isActive = false;
    
    if (monitor.interval) {
      clearInterval(monitor.interval);
    }
    
    if (monitor.page) {
      await monitor.page.close().catch(console.error);
    }
    
    this.listMonitors.delete(listId);
    
    const list = this.lists.get(listId);
    if (list) {
      list.isActive = false;
    }
    
    // 如果没有活动的监控了，关闭浏览器
    if (this.listMonitors.size === 0 && this.browser) {
      await this.browser.close().catch(console.error);
      this.browser = null;
    }
    
    this.broadcast({ type: 'monitoring_stopped', listId });
    console.log(`🛑 停止监控列表: ${listId}`);
  }

  async checkListForNewTweets(listId) {
    const monitor = this.listMonitors.get(listId);
    const list = this.lists.get(listId);
    
    if (!monitor || !list) return;
    
    const checkTime = new Date().toLocaleTimeString();
    console.log(`\n[${checkTime}] 检查列表 "${list.name}" 的更新...`);
    
    try {
      await monitor.page.goto(list.url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      
      // 等待推文容器加载
      try {
        await monitor.page.waitForSelector('[data-testid="primaryColumn"]', { timeout: 10000 });
      } catch (e) {
        console.log('⚠️  等待推文容器超时，尝试继续...');
      }
      
      // 等待推文加载
      await monitor.page.waitForTimeout(5000);
      
      // 滚动页面以加载更多推文
      await monitor.page.evaluate(() => {
        window.scrollBy(0, 500);
      });
      await monitor.page.waitForTimeout(2000);
      
      // 再次滚动以确保加载更多历史推文
      await monitor.page.evaluate(() => {
        window.scrollBy(0, 1000);
      });
      await monitor.page.waitForTimeout(3000);
      
      const tweets = await monitor.page.evaluate(() => {
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

      console.log(`📊 列表 "${list.name}" 找到 ${tweets.length} 条推文`);
      
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
      const listTweets = this.tweets.get(listId);
      
      // 应用过滤规则来判断是否应该通知
      const listFilters = this.filters.get(listId) || [];
      const shouldNotify = (tweet) => {
        // 先应用列表过滤规则
        if (listFilters.length > 0) {
          const filtered = this.applyFilters([tweet], listFilters);
          if (filtered.length === 0) return false;
        }
        
        // 再应用全局过滤规则
        if (this.globalFilters.length > 0) {
          const filtered = this.applyFilters([tweet], this.globalFilters);
          if (filtered.length === 0) return false;
        }
        
        return true;
      };
      
      for (const tweet of recentTweets) {
        // 使用更可靠的ID生成方式
        const tweetId = tweet.link 
          ? tweet.link.split('/status/')[1] 
          : `${tweet.userHandle}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        if (!listTweets.has(tweetId)) {
          const tweetData = {
            id: tweetId,
            listId,
            ...tweet,
            timestamp: new Date().toISOString(),
            isNew: true,
            tweetTime: tweet.time // 保留原始推文时间
          };
          
          listTweets.set(tweetId, tweetData);
          allTweetsToSend.push(tweetData);
          
          // 只有通过过滤的推文才计入新推文数
          if (shouldNotify(tweetData)) {
            newCount++;
            console.log(`🆕 新推文（通过过滤）: @${tweet.userHandle}: ${tweet.text.substring(0, 50)}...`);
          } else {
            console.log(`🔇 新推文（被过滤）: @${tweet.userHandle}: ${tweet.text.substring(0, 50)}...`);
          }
        } else {
          // 也包含已存在的24小时内的推文
          const existingTweet = listTweets.get(tweetId);
          existingTweet.isNew = false; // 标记为非新推文
          allTweetsToSend.push(existingTweet);
        }
      }
      
      if (listTweets.size > 0) {
        await this.saveData();
      }
      
      // 更新列表的推文计数
      list.tweetsCount = listTweets.size;
      
      // 发送所有24小时内的推文
      this.broadcast({
        type: 'tweets_update',
        listId,
        tweets: allTweetsToSend,
        newCount: newCount,
        totalCount: allTweetsToSend.length
      });
      
      if (newCount > 0) {
        console.log(`✨ 列表 "${list.name}" 发现 ${newCount} 条新推文（通过过滤）！`);
      } else {
        console.log(`💤 列表 "${list.name}" 没有新推文（或被过滤）`);
      }
      console.log(`📊 列表 "${list.name}" 24小时内总计 ${allTweetsToSend.length} 条推文`);
      
      // 发送心跳
      this.broadcast({
        type: 'heartbeat',
        listId,
        lastCheck: new Date().toISOString(),
        tweetsCount: listTweets.size,
        recentTweetsCount: allTweetsToSend.length
      });
      
    } catch (error) {
      console.error(`❌ 检查列表 "${list.name}" 的推文失败:`, error.message);
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

  async loadData() {
    try {
      const data = await fs.readFile(this.config.dataFile, 'utf8');
      const savedData = JSON.parse(data);
      
      // 加载列表
      if (savedData.lists) {
        savedData.lists.forEach(list => {
          this.lists.set(list.id, list);
        });
      }
      
      // 加载推文
      if (savedData.tweets) {
        for (const [listId, tweets] of Object.entries(savedData.tweets)) {
          const tweetMap = new Map();
          tweets.forEach(tweet => {
            tweetMap.set(tweet.id, tweet);
          });
          this.tweets.set(listId, tweetMap);
        }
      }
      
      // 加载过滤规则
      if (savedData.filters) {
        if (savedData.filters.global) {
          this.globalFilters = savedData.filters.global;
        }
        if (savedData.filters.lists) {
          for (const [listId, filters] of Object.entries(savedData.filters.lists)) {
            this.filters.set(listId, filters);
          }
        }
      }
      
      console.log(`📂 加载了 ${this.lists.size} 个列表配置`);
      console.log(`🔍 加载了 ${this.globalFilters.length} 个全局过滤规则`);
    } catch (error) {
      console.log('📂 没有找到历史数据文件，将创建新文件');
    }
  }

  async saveData() {
    const tweetsData = {};
    for (const [listId, tweetMap] of this.tweets.entries()) {
      tweetsData[listId] = Array.from(tweetMap.values());
    }
    
    const filtersData = {
      global: this.globalFilters,
      lists: Object.fromEntries(this.filters)
    };
    
    const data = {
      lists: Array.from(this.lists.values()),
      tweets: tweetsData,
      filters: filtersData,
      lastSave: new Date().toISOString()
    };
    
    await fs.writeFile(this.config.dataFile, JSON.stringify(data, null, 2));
  }

  async close() {
    // 停止所有监控
    for (const listId of this.listMonitors.keys()) {
      await this.stopMonitoringList(listId);
    }
    
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
// desktop-app/src/window-tracker.js
const activeWin = require('active-win');
const Store = require('electron-store');

class WindowTracker {
  constructor(mainApp) {
    this.app = mainApp;
    this.store = new Store();
    this.isTracking = false;
    this.trackingInterval = null;
    this.currentWindow = null;
    this.windowStartTime = null;
    this.windowHistory = [];
    this.rules = [];
  }

  async init() {
    console.log('👁️ Initializing Window Tracker...');
    
    // Load tracking rules
    await this.loadRules();
    
    // Load settings
    const enabled = this.store.get('windowTracking.enabled', false);
    if (enabled) {
      await this.start();
    }
    
    console.log('✅ Window Tracker initialized');
  }

  async start() {
    if (this.isTracking) return;
    
    console.log('🔍 Starting window tracking...');
    
    this.isTracking = true;
    const interval = this.store.get('windowTracking.checkInterval', 5000);
    
    this.trackingInterval = setInterval(async () => {
      await this.checkActiveWindow();
    }, interval);
    
    // Initial check
    await this.checkActiveWindow();
  }

  stop() {
    if (!this.isTracking) return;
    
    console.log('⏹️ Stopping window tracking...');
    
    this.isTracking = false;
    
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }
    
    // Record final window if needed
    if (this.currentWindow && this.windowStartTime) {
      this.recordWindowSession();
    }
  }

  async checkActiveWindow() {
    try {
      const activeWindow = await activeWin();
      
      if (!activeWindow) return;
      
      // Check if window changed
      const windowChanged = !this.currentWindow || 
        this.currentWindow.title !== activeWindow.title ||
        this.currentWindow.owner.name !== activeWindow.owner.name;
      
      if (windowChanged) {
        // Record previous window session
        if (this.currentWindow && this.windowStartTime) {
          await this.recordWindowSession();
        }
        
        // Start tracking new window
        this.currentWindow = activeWindow;
        this.windowStartTime = Date.now();
        
        // Check rules for this window
        await this.checkRules(activeWindow);
        
        // Record window change event
        await this.recordWindowEvent('window_change', activeWindow);
      }
      
    } catch (error) {
      console.error('Error checking active window:', error);
    }
  }

  async recordWindowSession() {
    const now = Date.now();
    const duration = now - this.windowStartTime;
    const minTime = this.store.get('windowTracking.minWindowTime', 30000);
    
    // Only record if window was active long enough
    if (duration < minTime) return;
    
    const session = {
      id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title: this.currentWindow.title,
      app: this.currentWindow.owner.name,
      url: this.currentWindow.url || null,
      startTime: this.windowStartTime,
      endTime: now,
      duration: duration,
      productivity: this.calculateProductivity(this.currentWindow),
      category: this.categorizeWindow(this.currentWindow),
      timestamp: now
    };
    
    // Store locally
    this.windowHistory.push(session);
    
    // Keep only recent history
    if (this.windowHistory.length > 1000) {
      this.windowHistory = this.windowHistory.slice(-500);
    }
    
    this.store.set('windowHistory', this.windowHistory);
    
    // Queue for sync
    if (this.app.syncManager) {
      this.app.syncManager.queueWindowEvent(session);
    }
    
    console.log(`📝 Recorded window session: ${session.app} - ${Math.round(duration/1000)}s`);
  }

  async recordWindowEvent(eventType, windowData) {
    const event = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: eventType,
      timestamp: Date.now(),
      data: {
        title: windowData.title,
        app: windowData.owner.name,
        url: windowData.url || null,
        domain: this.extractDomain(windowData.url),
        category: this.categorizeWindow(windowData)
      }
    };
    
    // Queue for sync
    if (this.app.syncManager) {
      this.app.syncManager.queueWindowEvent(event);
    }
  }

  calculateProductivity(windowData) {
    const app = windowData.owner.name.toLowerCase();
    const title = windowData.title.toLowerCase();
    
    // Define productivity patterns
    const productiveApps = [
      'visual studio code', 'intellij', 'eclipse', 'sublime',
      'figma', 'sketch', 'photoshop',
      'microsoft excel', 'google sheets',
      'notion', 'obsidian', 'roam research'
    ];
    
    const neutralApps = [
      'slack', 'discord', 'microsoft teams',
      'google chrome', 'firefox', 'safari',
      'finder', 'explorer'
    ];
    
    const distractingApps = [
      'netflix', 'youtube', 'spotify',
      'facebook', 'twitter', 'instagram',
      'reddit', 'tiktok'
    ];
    
    // Check app names
    if (productiveApps.some(app_name => app.includes(app_name))) {
      return 1; // Productive
    }
    
    if (distractingApps.some(app_name => app.includes(app_name))) {
      return -1; // Distracting
    }
    
    // Check URL/title patterns for browsers
    if (app.includes('chrome') || app.includes('firefox') || app.includes('safari')) {
      const url = windowData.url || '';
      const domain = this.extractDomain(url);
      
      if (domain) {
        if (['github.com', 'stackoverflow.com', 'docs.google.com'].includes(domain)) {
          return 1;
        }
        if (['youtube.com', 'netflix.com', 'facebook.com', 'twitter.com'].includes(domain)) {
          return -1;
        }
      }
    }
    
    return 0; // Neutral
  }

  categorizeWindow(windowData) {
    const app = windowData.owner.name.toLowerCase();
    const url = windowData.url || '';
    const domain = this.extractDomain(url);
    
    // Development
    if (app.includes('code') || app.includes('intellij') || app.includes('eclipse')) {
      return 'development';
    }
    
    // Design
    if (app.includes('figma') || app.includes('sketch') || app.includes('photoshop')) {
      return 'design';
    }
    
    // Communication
    if (app.includes('slack') || app.includes('teams') || app.includes('discord')) {
      return 'communication';
    }
    
    // Browser-based categorization
    if (domain) {
      if (['github.com', 'gitlab.com'].includes(domain)) return 'development';
      if (['figma.com', 'dribbble.com'].includes(domain)) return 'design';
      if (['slack.com', 'teams.microsoft.com'].includes(domain)) return 'communication';
      if (['docs.google.com', 'notion.so'].includes(domain)) return 'documentation';
      if (['youtube.com', 'netflix.com'].includes(domain)) return 'entertainment';
    }
    
    return 'general';
  }

  extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  async loadRules() {
    this.rules = this.store.get('windowRules', []);
  }

  async checkRules(windowData) {
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      
      if (await this.matchesRule(windowData, rule)) {
        await this.executeRule(rule, windowData);
        break; // Execute only first matching rule
      }
    }
  }

  async matchesRule(windowData, rule) {
    const { conditions } = rule;
    
    // Domain matching
    if (conditions.domain) {
      const domain = this.extractDomain(windowData.url);
      if (!domain || !domain.includes(conditions.domain)) {
        return false;
      }
    }
    
    // Title pattern matching
    if (conditions.titlePattern) {
      const regex = new RegExp(conditions.titlePattern, 'i');
      if (!regex.test(windowData.title)) {
        return false;
      }
    }
    
    // App name matching
    if (conditions.appName) {
      if (!windowData.owner.name.toLowerCase().includes(conditions.appName.toLowerCase())) {
        return false;
      }
    }
    
    // Time-based conditions
    if (conditions.timeConditions?.enabled) {
      if (!this.matchesTimeConditions(conditions.timeConditions)) {
        return false;
      }
    }
    
    return true;
  }

  matchesTimeConditions(timeConditions) {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    
    // Check time range
    if (timeConditions.startTime && timeConditions.endTime) {
      const startHour = parseInt(timeConditions.startTime.split(':')[0]);
      const endHour = parseInt(timeConditions.endTime.split(':')[0]);
      if (currentHour < startHour || currentHour > endHour) {
        return false;
      }
    }
    
    // Check days of week
    if (timeConditions.daysOfWeek && timeConditions.daysOfWeek.length > 0) {
      if (!timeConditions.daysOfWeek.includes(currentDay)) {
        return false;
      }
    }
    
    return true;
  }

  async executeRule(rule, windowData) {
    const { actionConfig } = rule;
    
    console.log(`🎯 Executing rule: ${rule.name} for ${windowData.owner.name}`);
    
    switch (actionConfig.action) {
      case 'start_timer':
        if (!this.app.currentSession || this.app.currentSession.projectId !== actionConfig.projectId) {
          await this.app.startSession(actionConfig.projectId, actionConfig.description || windowData.title);
          
          if (actionConfig.notifyUser) {
            this.app.showNotification({
              title: 'Timer Started',
              body: `Started tracking: ${actionConfig.description || windowData.title}`,
              onClick: () => this.app.showWindow()
            });
          }
        }
        break;
        
      case 'switch_project':
        if (this.app.currentSession && this.app.currentSession.projectId !== actionConfig.projectId) {
          await this.app.stopSession();
          await this.app.startSession(actionConfig.projectId, actionConfig.description || windowData.title);
          
          if (actionConfig.notifyUser) {
            this.app.showNotification({
              title: 'Project Switched',
              body: `Switched to: ${actionConfig.description || windowData.title}`
            });
          }
        }
        break;
        
      case 'suggest_project':
        if (!this.app.currentSession) {
          this.app.showNotification({
            title: 'Project Suggestion',
            body: `Start tracking: ${actionConfig.description || windowData.title}?`,
            onClick: () => {
              this.app.showWindow();
              this.app.mainWindow?.webContents.send('suggest-project', actionConfig.projectId);
            }
          });
        }
        break;
        
      case 'pause_timer':
        if (this.app.currentSession) {
          await this.app.pauseSession();
          
          if (actionConfig.notifyUser) {
            this.app.showNotification({
              title: 'Timer Paused',
              body: 'Timer paused due to detected distraction'
            });
          }
        }
        break;
    }
    
    // Update rule analytics
    await this.updateRuleAnalytics(rule.id, true);
  }

  async updateRuleAnalytics(ruleId, wasTriggered) {
    const analytics = this.store.get('ruleAnalytics', {});
    
    if (!analytics[ruleId]) {
      analytics[ruleId] = {
        triggerCount: 0,
        lastTriggered: null,
        successRate: 0
      };
    }
    
    if (wasTriggered) {
      analytics[ruleId].triggerCount++;
      analytics[ruleId].lastTriggered = Date.now();
    }
    
    this.store.set('ruleAnalytics', analytics);
  }

  getAnalytics() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    
    const todayHistory = this.windowHistory.filter(w => w.timestamp >= oneDayAgo);
    const weekHistory = this.windowHistory.filter(w => w.timestamp >= oneWeekAgo);
    
    return {
      today: this.aggregateWindowData(todayHistory),
      thisWeek: this.aggregateWindowData(weekHistory),
      total: this.aggregateWindowData(this.windowHistory)
    };
  }

  aggregateWindowData(windowData) {
    const totalTime = windowData.reduce((sum, w) => sum + w.duration, 0);
    const productiveTime = windowData
      .filter(w => w.productivity > 0)
      .reduce((sum, w) => sum + w.duration, 0);
    
    const categories = {};
    windowData.forEach(w => {
      categories[w.category] = (categories[w.category] || 0) + w.duration;
    });
    
    return {
      totalTime,
      productiveTime,
      productivityScore: totalTime > 0 ? (productiveTime / totalTime) * 100 : 0,
      windowSwitches: windowData.length,
      categories: Object.entries(categories).map(([name, time]) => ({ name, time })),
      averageSessionTime: windowData.length > 0 ? totalTime / windowData.length : 0
    };
  }

  destroy() {
    this.stop();
  }
}

module.exports = WindowTracker;
// ===== browser-extension/background.js =====
// Fixed Background Service Worker for Manifest V3
// Removes ES6 imports that cause Status Code 15 errors

console.log('🚀 Financial Cents Timer Extension - Background Script Loading...');

class FinancialCentsExtension {
  constructor() {
    this.version = '2.0.0';
    this.isInitialized = false;
    
    // Configuration
    this.config = {
      serverUrls: {
        production: 'https://my-time-tracker.onrender.com/api',
        local: 'http://localhost:3000/api',
        fallback: 'https://backup-server.onrender.com/api'
      },
      sync: {
        interval: 30000, // 30 seconds
        maxRetries: 3,
        backoffMultiplier: 2
      }
    };

    // State management
    this.state = {
      currentTab: null,
      activeTimer: null,
      lastActivity: Date.now(),
      isOnline: false,
      currentApiUrl: null,
      sessionId: this.generateSessionId(),
      rules: new Map(),
      analytics: {
        windowEvents: [],
        rulePerformance: [],
        userInteractions: []
      }
    };

    this.offlineQueue = [];
    this.rules = new Map();
    this.patterns = new Map();

    // Initialize immediately
    this.init();
  }

  async init() {
    console.log('🔧 Initializing extension...');

    try {
      // Load stored data first
      await this.loadStoredData();
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Initialize API connection
      await this.initializeApiConnection();
      
      // Start monitoring
      this.startWindowMonitoring();
      this.startSyncProcess();
      
      this.isInitialized = true;
      console.log('✅ Extension initialized successfully');
      
      // Send ready signal
      this.broadcastMessage('extension:ready', {
        version: this.version,
        sessionId: this.state.sessionId,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('❌ Extension initialization failed:', error);
      this.handleInitializationError(error);
    }
  }

  setupEventListeners() {
    console.log('📡 Setting up event listeners...');

    // Tab events
    if (chrome.tabs) {
      chrome.tabs.onActivated.addListener((activeInfo) => {
        this.handleTabActivated(activeInfo);
      });

      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        this.handleTabUpdated(tabId, changeInfo, tab);
      });

      chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
        this.handleTabRemoved(tabId, removeInfo);
      });
    }

    // Window events
    if (chrome.windows) {
      chrome.windows.onFocusChanged.addListener((windowId) => {
        this.handleWindowFocusChanged(windowId);
      });
    }

    // Idle detection
    if (chrome.idle) {
      chrome.idle.setDetectionInterval(60);
      chrome.idle.onStateChanged.addListener((state) => {
        this.handleIdleStateChange(state);
      });
    }

    // Alarms for periodic tasks
    if (chrome.alarms) {
      chrome.alarms.onAlarm.addListener((alarm) => {
        this.handleAlarm(alarm);
      });
    }

    // Web navigation
    if (chrome.webNavigation) {
      chrome.webNavigation.onCompleted.addListener((details) => {
        this.handleNavigationCompleted(details);
      });
    }

    // Extension messages
    if (chrome.runtime) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true; // Keep message channel open for async responses
      });

      chrome.runtime.onInstalled.addListener((details) => {
        this.handleInstalled(details);
      });
    }

    // Command shortcuts
    if (chrome.commands) {
      chrome.commands.onCommand.addListener((command) => {
        this.handleCommand(command);
      });
    }

    console.log('✅ Event listeners setup complete');
  }

  async handleTabActivated(activeInfo) {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      await this.processTabChange(tab, 'activated');
    } catch (error) {
      console.error('Error handling tab activation:', error);
    }
  }

  async handleTabUpdated(tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete' && tab.url) {
      await this.processTabChange(tab, 'updated');
    }
  }

  async handleTabRemoved(tabId, removeInfo) {
    // Clean up any timers or tracking for this tab
    await this.recordAnalyticsEvent('tab_closed', {
      tabId,
      timestamp: Date.now(),
      windowId: removeInfo.windowId,
      isWindowClosing: removeInfo.isWindowClosing
    });
  }

  async handleWindowFocusChanged(windowId) {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Browser lost focus
      await this.handleBrowserFocusLost();
    } else {
      // Browser gained focus
      await this.handleBrowserFocusGained(windowId);
    }
  }

  async handleIdleStateChange(state) {
    const timestamp = Date.now();
    await this.recordAnalyticsEvent('idle_state_change', {
      state,
      timestamp,
      previousState: this.state.idleState
    });

    this.state.idleState = state;

    // Handle timer based on idle state
    if (state === 'idle' || state === 'locked') {
      await this.handleUserIdle();
    } else if (state === 'active') {
      await this.handleUserActive();
    }
  }

  async handleAlarm(alarm) {
    switch (alarm.name) {
      case 'sync-timer':
        await this.performSync();
        break;
      case 'analytics-flush':
        await this.flushAnalytics();
        break;
      case 'keep-alive':
        await this.performKeepAlive();
        break;
      default:
        console.log('Unknown alarm:', alarm.name);
    }
  }

  async handleNavigationCompleted(details) {
    if (details.frameId === 0) { // Main frame only
      try {
        const tab = await chrome.tabs.get(details.tabId);
        await this.processNavigationEvent(tab, details);
      } catch (error) {
        console.error('Error handling navigation:', error);
      }
    }
  }
  // Add this method to your FinancialCentsExtension class
  async processNavigationEvent(tab, details) {
    try {
      console.log('Processing navigation event:', tab.url);
      
      if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        return; // Skip browser internal pages
      }

      const urlInfo = this.extractUrlInfo(tab.url);
      
      await this.recordAnalyticsEvent('navigation', {
        tabId: tab.id,
        url: details.url,
        domain: urlInfo.domain,
        timestamp: Date.now(),
        transitionType: details.transitionType || 'unknown',
        sessionId: this.state.sessionId
      });
       // Check if this navigation should trigger any rules
      await this.processWindowRules(tab, urlInfo, 'navigation');
      
    } catch (error) {
      console.error('Error processing navigation event:', error);
    }
  }
  async handleMessage(message, sender, sendResponse) {
    const { action, data } = message;

    try {
      switch (action) {
        case 'get-state':
          sendResponse({ success: true, data: this.getPublicState() });
          break;

        case 'start-timer':
          const startResult = await this.startTimer(data);
          sendResponse(startResult);
          break;

        case 'stop-timer':
          const stopResult = await this.stopTimer(data);
          sendResponse(stopResult);
          break;

        case 'get-projects':
          const projects = await this.getProjects();
          sendResponse({ success: true, data: projects });
          break;

        case 'force-sync':
          await this.performSync();
          sendResponse({ success: true });
          break;

        case 'pageData':
          await this.handlePageData(data);
          sendResponse({ success: true });
          break;

        case 'activityUpdate':
          await this.handleActivityUpdate(data);
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  }

  async handleCommand(command) {
    switch (command) {
      case 'start-timer':
        await this.toggleTimer();
        break;
      case 'quick-entry':
        await this.openQuickEntry();
        break;
      case 'open-dashboard':
        await this.openAnalyticsDashboard();
        break;
    }
  }

  async handleInstalled(details) {
    if (details.reason === 'install') {
      await this.performFirstTimeSetup();
    } else if (details.reason === 'update') {
      await this.performUpdate(details.previousVersion);
    }
  }

  // Core tracking logic
  async processTabChange(tab, eventType) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      return; // Skip browser internal pages
    }

    const previousTab = this.state.currentTab;
    this.state.currentTab = tab;
    this.state.lastActivity = Date.now();

    // Extract URL information
    const urlInfo = this.extractUrlInfo(tab.url);

    // Record window event
    await this.recordAnalyticsEvent('window_change', {
      eventType,
      tabId: tab.id,
      windowId: tab.windowId,
      url: tab.url,
      title: tab.title,
      domain: urlInfo.domain,
      category: this.categorizeUrl(urlInfo),
      timestamp: Date.now(),
      previousUrl: previousTab?.url,
      sessionId: this.state.sessionId
    });

    // Check rules and potentially start/modify timer
    await this.processWindowRules(tab, urlInfo, eventType);
  }

  extractUrlInfo(url) {
    try {
      const urlObj = new URL(url);
      return {
        domain: urlObj.hostname,
        subdomain: urlObj.hostname.split('.').slice(0, -2).join('.'),
        path: urlObj.pathname,
        query: urlObj.search,
        protocol: urlObj.protocol,
        port: urlObj.port,
        pathSegments: urlObj.pathname.split('/').filter(Boolean),
        queryParams: Object.fromEntries(urlObj.searchParams)
      };
    } catch (error) {
      console.error('Error parsing URL:', error);
      return {
        domain: 'unknown',
        subdomain: '',
        path: '',
        query: '',
        protocol: '',
        port: '',
        pathSegments: [],
        queryParams: {}
      };
    }
  }

  categorizeUrl(urlInfo) {
    const domain = urlInfo.domain.toLowerCase();

    // Development platforms
    if (/github|gitlab|stackoverflow|codepen|jsfiddle|repl\.it/.test(domain)) {
      return 'development';
    }

    // Social media
    if (/facebook|twitter|instagram|linkedin|reddit|tiktok/.test(domain)) {
      return 'social_media';
    }

    // Entertainment
    if (/youtube|netflix|spotify|twitch|hulu/.test(domain)) {
      return 'entertainment';
    }

    // Productivity tools
    if (/notion|asana|trello|slack|discord|zoom|teams/.test(domain)) {
      return 'productivity';
    }

    // Default to general
    return 'general';
  }

  // Timer management
  async startTimer(data = {}) {
    try {
      const { projectId, description, source = 'extension' } = data;

      if (!projectId) {
        return { success: false, error: 'Project ID is required' };
      }

      // Stop any existing timer
      if (this.state.activeTimer) {
        await this.stopTimer({ source: 'auto' });
      }

      // Create new timer entry
      const timerData = {
        projectId: projectId,
        description: description || await this.generateSmartDescription(),
        startTime: new Date().toISOString(),
        source,
        metadata: {
          autoGenerated: source === 'rule',
          windowData: this.getCurrentWindowData(),
          deviceInfo: this.getDeviceInfo(),
          sessionId: this.state.sessionId
        }
      };

      // Try to send to server
      if (this.state.isOnline) {
        const result = await this.makeApiRequest('POST', '/time-entries', timerData);
        
        if (result.success) {
          this.state.activeTimer = result.data;
        } else {
          // Queue for offline sync
          this.queueOfflineAction('create_timer', timerData);
          this.state.activeTimer = { ...timerData, id: `local_${Date.now()}` };
        }
      } else {
        // Queue for offline sync
        this.queueOfflineAction('create_timer', timerData);
        this.state.activeTimer = { ...timerData, id: `local_${Date.now()}` };
      }

      // Update UI
      this.broadcastMessage('timer:started', {
        timer: this.state.activeTimer,
        timestamp: Date.now()
      });

      // Show notification
      await this.showNotification({
        title: 'Timer Started',
        message: `Tracking: ${description || 'Work session'}`,
        type: 'success'
      });

      return { success: true, data: this.state.activeTimer };

    } catch (error) {
      console.error('Error starting timer:', error);
      return { success: false, error: error.message };
    }
  }

  async stopTimer(data = {}) {
    try {
      if (!this.state.activeTimer) {
        return { success: false, error: 'No active timer to stop' };
      }

      const { source = 'manual' } = data;
      const endTime = new Date().toISOString();
      const duration = new Date(endTime) - new Date(this.state.activeTimer.startTime);

      // Update timer entry
      const updateData = {
        endTime,
        duration,
        isRunning: false,
        metadata: {
          ...this.state.activeTimer.metadata,
          stopSource: source,
          finalWindowData: this.getCurrentWindowData()
        }
      };

      // Try to send to server
      if (this.state.isOnline && this.state.activeTimer.id && !this.state.activeTimer.id.startsWith('local_')) {
        const result = await this.makeApiRequest('PUT', `/time-entries/${this.state.activeTimer.id}`, updateData);
        
        if (!result.success) {
          // Queue for offline sync
          this.queueOfflineAction('update_timer', { ...this.state.activeTimer, ...updateData });
        }
      } else {
        // Queue for offline sync
        this.queueOfflineAction('update_timer', { ...this.state.activeTimer, ...updateData });
      }

      const completedTimer = { ...this.state.activeTimer, ...updateData };
      this.state.activeTimer = null;

      // Update UI
      this.broadcastMessage('timer:stopped', {
        timer: completedTimer,
        timestamp: Date.now()
      });

      // Show notification
      await this.showNotification({
        title: 'Timer Stopped',
        message: `Tracked: ${this.formatDuration(duration)}`,
        type: 'info'
      });

      return { success: true, data: completedTimer };

    } catch (error) {
      console.error('Error stopping timer:', error);
      return { success: false, error: error.message };
    }
  }

  async toggleTimer() {
    if (this.state.activeTimer) {
      return await this.stopTimer({ source: 'keyboard' });
    } else {
      // Try to suggest a project or use default
      const suggestion = await this.suggestProject();
      if (suggestion) {
        return await this.startTimer({
          projectId: suggestion.projectId,
          description: suggestion.description,
          source: 'keyboard'
        });
      } else {
        return { success: false, error: 'No project available to start timer' };
      }
    }
  }

  // Window Rules Processing
  async processWindowRules(tab, urlInfo, eventType) {
    try {
      const activeRules = await this.getActiveRules();
      
      for (const rule of activeRules) {
        if (await this.matchesRule(tab, urlInfo, rule)) {
          await this.executeRule(rule, tab, urlInfo, eventType);
          break; // Execute only first matching rule
        }
      }
    } catch (error) {
      console.error('Error processing window rules:', error);
    }
  }

  async getActiveRules() {
    // Return rules from memory, loaded during init
    return Array.from(this.rules.values()).filter(rule => rule.enabled);
  }

  async matchesRule(tab, urlInfo, rule) {
    const { conditions } = rule;
    
    try {
      // Domain matching
      if (conditions.domain) {
        if (!urlInfo.domain.includes(conditions.domain)) return false;
      }

      // Title pattern matching
      if (conditions.titlePattern) {
        const regex = new RegExp(conditions.titlePattern, 'i');
        if (!regex.test(tab.title)) return false;
      }

      // URL pattern matching
      if (conditions.urlPattern) {
        const regex = new RegExp(conditions.urlPattern, 'i');
        if (!regex.test(tab.url)) return false;
      }

      return true;
    } catch (error) {
      console.error('Error matching rule:', error);
      return false;
    }
  }

  async executeRule(rule, tab, urlInfo, eventType) {
    const { actionConfig } = rule;
    
    try {
      switch (actionConfig.action) {
        case 'start_timer':
          await this.startTimer({
            projectId: actionConfig.projectId,
            description: actionConfig.description || tab.title,
            source: 'browser_rule',
            ruleId: rule.id
          });
          break;

        case 'suggest_project':
          await this.showNotification({
            title: 'Project Suggestion',
            message: `Start tracking "${actionConfig.description}"?`,
            type: 'suggestion'
          });
          break;

        case 'pause_timer':
          await this.stopTimer({ source: 'rule' });
          break;
      }

      console.log(`Executed rule: ${rule.name} for ${tab.title}`);
    } catch (error) {
      console.error('Error executing rule:', error);
    }
  }

  // API and Network Methods
  async initializeApiConnection() {
    const urls = Object.values(this.config.serverUrls);
    
    for (const url of urls) {
      try {
        const response = await fetch(`${url}/health`, {
          method: 'GET',
          headers: { 'X-Keep-Alive': 'extension' }
        });
        
        if (response.ok) {
          this.state.currentApiUrl = url;
          this.state.isOnline = true;
          console.log(`✅ Connected to server: ${url}`);
          return;
        }
      } catch (error) {
        console.log(`❌ Failed to connect to ${url}:`, error.message);
      }
    }

    console.warn('⚠️ No server connection available, working offline');
    this.state.isOnline = false;
  }

  async makeApiRequest(method, endpoint, data = null) {
    if (!this.state.currentApiUrl) {
      throw new Error('No API URL available');
    }

    const url = `${this.state.currentApiUrl}${endpoint}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Keep-Alive': 'extension'
      }
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const result = await response.json();
      
      return {
        success: response.ok,
        data: result,
        status: response.status
      };
    } catch (error) {
      console.error('API Request failed:', error);
      return { success: false, error: error.message };
    }
  }

  // Utility Methods
  getCurrentWindowData() {
    if (!this.state.currentTab) return null;

    const urlInfo = this.extractUrlInfo(this.state.currentTab.url);
    return {
      domain: urlInfo.domain,
      title: this.state.currentTab.title,
      url: this.state.currentTab.url,
      category: this.categorizeUrl(urlInfo),
      timestamp: Date.now()
    };
  }

  getDeviceInfo() {
    return {
      userAgent: navigator.userAgent,
      platform: 'browser_extension',
      version: this.version,
      timestamp: Date.now()
    };
  }

  async generateSmartDescription() {
    const windowData = this.getCurrentWindowData();
    if (!windowData) return 'Work session';

    const domain = windowData.domain;
    const title = windowData.title;

    if (domain.includes('github')) {
      return `Development work - ${title.split(' - ')[0]}`;
    } else if (domain.includes('docs.google')) {
      return `Documentation - ${title.replace(' - Google Docs', '')}`;
    } else if (domain.includes('figma')) {
      return `Design work - ${title.split(' -- ')[0]}`;
    } else {
      return `Work on ${domain}`;
    }
  }

  formatDuration(ms) {
    const hours = Math.floor(ms / (60 * 60 * 1000));
    const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Storage and Data Management
  async loadStoredData() {
    try {
      const data = await chrome.storage.local.get([
        'windowRules',
        'projects',
        'settings',
        'lastSyncTime'
      ]);

      if (data.windowRules) {
        this.rules.clear();
        data.windowRules.forEach(rule => {
          this.rules.set(rule.id, rule);
        });
      }

      console.log(`Loaded ${this.rules.size} rules from storage`);
    } catch (error) {
      console.error('Error loading stored data:', error);
    }
  }

  async saveStoredData() {
    try {
      await chrome.storage.local.set({
        windowRules: Array.from(this.rules.values()),
        lastActivity: this.state.lastActivity,
        sessionId: this.state.sessionId
      });
    } catch (error) {
      console.error('Error saving stored data:', error);
    }
  }

  // Offline Queue Management
  queueOfflineAction(action, data) {
    this.offlineQueue.push({
      id: `queue_${Date.now()}`,
      action,
      data,
      timestamp: Date.now()
    });

    // Limit queue size
    if (this.offlineQueue.length > 100) {
      this.offlineQueue = this.offlineQueue.slice(-50);
    }
  }

  async processOfflineQueue() {
    if (this.offlineQueue.length === 0 || !this.state.isOnline) return;

    const processedItems = [];
    
    for (const item of this.offlineQueue) {
      try {
        let result = false;
        
        switch (item.action) {
          case 'create_timer':
            result = await this.makeApiRequest('POST', '/time-entries', item.data);
            break;
          case 'update_timer':
            result = await this.makeApiRequest('PUT', `/time-entries/${item.data.id}`, item.data);
            break;
        }

        if (result.success) {
          processedItems.push(item.id);
        }
      } catch (error) {
        console.error('Failed to process offline queue item:', error);
        break;
      }
    }

    // Remove processed items
    this.offlineQueue = this.offlineQueue.filter(item => 
      !processedItems.includes(item.id)
    );

    if (processedItems.length > 0) {
      console.log(`Processed ${processedItems.length} offline queue items`);
    }
  }

  // Analytics and Events
  async recordAnalyticsEvent(type, data) {
    // Store locally and batch send
    const event = {
      type,
      timestamp: Date.now(),
      data,
      sessionId: this.state.sessionId
    };

    this.state.analytics.windowEvents.push(event);

    // Limit analytics storage
    if (this.state.analytics.windowEvents.length > 1000) {
      this.state.analytics.windowEvents = this.state.analytics.windowEvents.slice(-500);
    }
  }

  async flushAnalytics() {
    if (this.state.analytics.windowEvents.length === 0 || !this.state.isOnline) return;

    try {
      const events = this.state.analytics.windowEvents.splice(0, 50);
      const result = await this.makeApiRequest('POST', '/analytics/events', { events });
      
      if (!result.success) {
        // Return events to queue if failed
        this.state.analytics.windowEvents.unshift(...events);
      }
    } catch (error) {
      console.error('Error flushing analytics:', error);
    }
  }

  // Monitoring and Periodic Tasks
  startWindowMonitoring() {
    // Set up periodic window checking
    if (chrome.alarms) {
      chrome.alarms.create('window-check', { periodInMinutes: 0.1 }); // Every 6 seconds
    }
  }

  startSyncProcess() {
    // Set up sync interval
    if (chrome.alarms) {
      chrome.alarms.create('sync-timer', { periodInMinutes: 0.5 }); // Every 30 seconds
      chrome.alarms.create('analytics-flush', { periodInMinutes: 1 }); // Every minute
    }
  }

  async performSync() {
    if (!this.state.isOnline) return;

    try {
      await this.processOfflineQueue();
      await this.flushAnalytics();
      console.log('Sync completed');
    } catch (error) {
      console.error('Sync failed:', error);
    }
  }

  async performKeepAlive() {
    if (this.state.isOnline && this.state.currentApiUrl) {
      try {
        await fetch(`${this.state.currentApiUrl}/health`, {
          method: 'GET',
          headers: { 'X-Keep-Alive': 'extension-keepalive' }
        });
      } catch (error) {
        console.log('Keep-alive ping failed:', error.message);
        this.state.isOnline = false;
      }
    }
  }

  // Communication Methods
  broadcastMessage(type, data) {
    // Send to popup and other extension parts
    chrome.runtime.sendMessage({ type, data }).catch(() => {
      // Popup might not be open, which is fine
    });

    // Send to content scripts
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, { type, data }).catch(() => {
          // Tab might not have content script, which is fine
        });
      });
    });
  }

  async showNotification(options) {
    const { title, message, type = 'info' } = options;
    
    try {
      await chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title,
        message
      });
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  // Getters
  getPublicState() {
    return {
      isInitialized: this.isInitialized,
      activeTimer: this.state.activeTimer,
      currentTab: this.state.currentTab ? {
        id: this.state.currentTab.id,
        url: this.state.currentTab.url,
        title: this.state.currentTab.title
      } : null,
      isOnline: this.state.isOnline,
      lastActivity: this.state.lastActivity,
      sessionId: this.state.sessionId,
      queueSize: this.offlineQueue.length
    };
  }

  // Placeholder methods for future implementation
  async getProjects() {
    if (this.state.isOnline) {
      const result = await this.makeApiRequest('GET', '/projects');
      return result.success ? result.data : [];
    }
    return [];
  }

  async suggestProject() {
    // Simple implementation - can be enhanced
    const projects = await this.getProjects();
    return projects.length > 0 ? {
      projectId: projects[0].id,
      description: projects[0].name
    } : null;
  }

  async openQuickEntry() {
    try {
      await chrome.action.openPopup();
    } catch (error) {
      console.error('Error opening popup:', error);
    }
  }

  async openAnalyticsDashboard() {
    try {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('analytics/dashboard.html')
      });
    } catch (error) {
      console.error('Error opening analytics dashboard:', error);
    }
  }

  async performFirstTimeSetup() {
    console.log('🎉 Welcome! Setting up Financial Cents Timer...');
    
    // Set default settings
    await chrome.storage.local.set({
      onboarded: true,
      installDate: Date.now(),
      settings: {
        notifications: true,
        autoSync: true,
        windowTracking: false
      }
    });
  }

  async performUpdate(previousVersion) {
    console.log(`📦 Updating from ${previousVersion} to ${this.version}`);
    
    // Show update notification
    await this.showNotification({
      title: 'Extension Updated',
      message: `Financial Cents Timer updated to v${this.version}`,
      type: 'info'
    });
  }

  handleInitializationError(error) {
    console.error('Extension initialization failed:', error);
    
    // Show error notification
    this.showNotification({
      title: 'Extension Error',
      message: 'Some features may not work properly. Please reload the extension.',
      type: 'error'
    });
  }

  // Idle state handlers
  async handleUserIdle() {
    console.log('User went idle');
    await this.recordAnalyticsEvent('user_idle', { timestamp: Date.now() });
  }

  async handleUserActive() {
    console.log('User became active');
    await this.recordAnalyticsEvent('user_active', { timestamp: Date.now() });
  }

  async handleBrowserFocusLost() {
    console.log('Browser focus lost');
    await this.recordAnalyticsEvent('browser_blur', { timestamp: Date.now() });
  }

  async handleBrowserFocusGained(windowId) {
    console.log('Browser focus gained');
    await this.recordAnalyticsEvent('browser_focus', { 
      windowId, 
      timestamp: Date.now() 
    });
  }

  async handlePageData(data) {
    // Handle page data from content script
    await this.recordAnalyticsEvent('page_data', data);
  }

  async handleActivityUpdate(data) {
    // Handle activity updates from content script
    await this.recordAnalyticsEvent('activity_update', data);
  }
}

// Initialize the extension
console.log('🚀 Creating extension instance...');
const extension = new FinancialCentsExtension();

console.log('✅ Background script loaded successfully');

// Financial Cents Timer - Enhanced Electron Main Process
// Cross-platform desktop app with advanced window tracking and sync

const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, shell, nativeTheme, globalShortcut, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const log = require('electron-log');
const path = require('path');
const fetch = require('node-fetch');
const activeWin = require('active-win');

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Initialize secure storage
const store = new Store({
    encryptionKey: 'financial-cents-secure-key-change-in-production',
    defaults: {
        windowBounds: { width: 380, height: 280 },
        serverUrl: 'https://my-time-tracker.onrender.com/api',
        theme: 'system',
        notifications: true,
        autoStart: false,
        minimizeToTray: true,
        keepAlive: true,
        windowTracking: {
            enabled: false,
            checkInterval: 5000,
            minWindowTime: 30000,
            excludedApps: ['System Preferences', 'Calculator']
        },
        analytics: {
            enabled: true,
            sendUsageData: true,
            learnPatterns: true
        },
        sync: {
            autoSync: true,
            syncInterval: 30000,
            conflictResolution: 'server_wins', // 'server_wins', 'local_wins', 'prompt'
            offlineQueueLimit: 100
        }
    }
});

class FinancialCentsApp {
    constructor() {
        this.mainWindow = null;
        this.tray = null;
        this.isQuitting = false;
        this.serverUrl = store.get('serverUrl');
        this.lastSync = 0;
        this.syncInterval = null;
        this.windowTrackingInterval = null;
        this.currentActiveWindow = null;
        this.windowStartTime = null;
        this.offlineQueue = [];
        this.currentSession = null;
        this.rules = [];
        this.analytics = {
            windowEvents: [],
            productivity: 0,
            focus: 0,
            patterns: new Map()
        };
        
        this.init();
    }

    init() {
        // App event handlers
        app.whenReady().then(() => {
            this.createWindow();
            this.createTray();
            this.createMenu();
            this.setupAutoUpdater();
            this.setupGlobalShortcuts();
            this.startSyncMonitoring();
            this.loadWindowTrackingRules();
            this.startWindowTracking();

            // macOS specific
            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.createWindow();
                }
            });
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('before-quit', () => {
            this.isQuitting = true;
            this.cleanup();
        });

        // IPC handlers
        this.setupIpcHandlers();

        // Security
        this.setupSecurity();
    }

    createWindow() {
        const windowBounds = store.get('windowBounds');
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;

        this.mainWindow = new BrowserWindow({
            ...windowBounds,
            minWidth: 350,
            minHeight: 250,
            maxWidth: 400,
            maxHeight: 600,
            x: width - windowBounds.width - 20,
            y: 20,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js'),
                webSecurity: true,
                allowRunningInsecureContent: false
            },
            titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
            show: false,
            alwaysOnTop: store.get('alwaysOnTop', false),
            skipTaskbar: store.get('skipTaskbar', false),
            icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png')
        });

        // Load the app
        this.mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

        // Window event handlers
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            
            // Development mode
            if (process.argv.includes('--dev')) {
                this.mainWindow.webContents.openDevTools();
            }
        });

        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        this.mainWindow.on('close', (event) => {
            if (!this.isQuitting && store.get('minimizeToTray')) {
                event.preventDefault();
                this.mainWindow.hide();
                return false;
            }
        });

        // Save window bounds on resize/move
        this.mainWindow.on('resize', () => this.saveWindowBounds());
        this.mainWindow.on('move', () => this.saveWindowBounds());

        // Handle external links
        this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });

        // Prevent navigation to external sites
        this.mainWindow.webContents.on('will-navigate', (event, url) => {
            if (!url.startsWith('file://')) {
                event.preventDefault();
                shell.openExternal(url);
            }
        });
    }

    createTray() {
        const iconPath = path.join(__dirname, 'assets', 
            process.platform === 'win32' ? 'tray-icon.ico' : 'tray-icon.png');

        this.tray = new Tray(iconPath);

        this.updateTrayMenu();

        this.tray.setToolTip('Financial Cents Timer');

        // Double-click to show window
        this.tray.on('double-click', () => {
            this.showWindow();
        });

        // Update tray based on timer state
        this.updateTrayIcon();
    }

    updateTrayMenu() {
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show Financial Cents Timer',
                click: () => {
                    this.showWindow();
                }
            },
            {
                label: 'Quick Start Timer',
                click: () => {
                    this.showQuickStartDialog();
                }
            },
            { type: 'separator' },
            {
                label: 'Window Tracking',
                type: 'checkbox',
                checked: store.get('windowTracking.enabled'),
                click: (item) => {
                    store.set('windowTracking.enabled', item.checked);
                    if (item.checked) {
                        this.startWindowTracking();
                    } else {
                        this.stopWindowTracking();
                    }
                }
            },
            {
                label: 'Sync Now',
                click: () => {
                    this.forceSync();
                }
            },
            {
                label: 'Settings',
                click: () => {
                    this.showSettings();
                }
            },
            { type: 'separator' },
            {
                label: 'Analytics Dashboard',
                click: () => {
                    this.openAnalyticsDashboard();
                }
            },
            { type: 'separator' },
            {
                label: 'Quit',
                click: () => {
                    this.isQuitting = true;
                    app.quit();
                }
            }
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    updateTrayIcon() {
        if (!this.tray) return;

        // Change tray icon based on timer state
        let iconName = 'tray-icon';
        if (this.currentSession) {
            iconName = 'tray-icon-active';
        }

        const iconPath = path.join(__dirname, 'assets', 
            process.platform === 'win32' ? `${iconName}.ico` : `${iconName}.png`);

        try {
            this.tray.setImage(iconPath);
        } catch (error) {
            // Fallback to default icon
            console.log('Tray icon update failed, using default');
        }
    }

    createMenu() {
        const template = [
            {
                label: 'File',
                submenu: [
                    {
                        label: 'New Timer',
                        accelerator: 'CmdOrCtrl+N',
                        click: () => {
                            this.mainWindow?.webContents.send('start-new-timer');
                        }
                    },
                    {
                        label: 'Stop Timer',
                        accelerator: 'CmdOrCtrl+S',
                        click: () => {
                            this.mainWindow?.webContents.send('stop-timer');
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'Export Data',
                        click: () => {
                            this.exportData();
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'Quit',
                        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                        click: () => {
                            this.isQuitting = true;
                            app.quit();
                        }
                    }
                ]
            },
            {
                label: 'Edit',
                submenu: [
                    { role: 'undo' },
                    { role: 'redo' },
                    { type: 'separator' },
                    { role: 'cut' },
                    { role: 'copy' },
                    { role: 'paste' }
                ]
            },
            {
                label: 'View',
                submenu: [
                    { role: 'reload' },
                    { role: 'forceReload' },
                    { role: 'toggleDevTools' },
                    { type: 'separator' },
                    { role: 'resetZoom' },
                    { role: 'zoomIn' },
                    { role: 'zoomOut' },
                    { type: 'separator' },
                    { role: 'togglefullscreen' }
                ]
            },
            {
                label: 'Window Tracking',
                submenu: [
                    {
                        label: 'Enable Window Tracking',
                        type: 'checkbox',
                        checked: store.get('windowTracking.enabled'),
                        click: (item) => {
                            store.set('windowTracking.enabled', item.checked);
                            if (item.checked) {
                                this.startWindowTracking();
                            } else {
                                this.stopWindowTracking();
                            }
                        }
                    },
                    {
                        label: 'Manage Rules',
                        click: () => {
                            this.showRulesManager();
                        }
                    },
                    {
                        label: 'View Analytics',
                        click: () => {
                            this.openAnalyticsDashboard();
                        }
                    }
                ]
            },
            {
                label: 'Sync',
                submenu: [
                    {
                        label: 'Sync Now',
                        accelerator: 'CmdOrCtrl+R',
                        click: () => {
                            this.forceSync();
                        }
                    },
                    {
                        label: 'Sync Status',
                        click: () => {
                            this.showSyncStatus();
                        }
                    },
                    { type: 'separator' },
                    {
                        label: 'Server Settings',
                        click: () => {
                            this.showServerSettings();
                        }
                    }
                ]
            },
            {
                label: 'Window',
                submenu: [
                    { role: 'minimize' },
                    { role: 'close' },
                    { type: 'separator' },
                    {
                        label: 'Always on Top',
                        type: 'checkbox',
                        checked: store.get('alwaysOnTop', false),
                        click: (item) => {
                            store.set('alwaysOnTop', item.checked);
                            this.mainWindow?.setAlwaysOnTop(item.checked);
                        }
                    }
                ]
            },
            {
                label: 'Help',
                submenu: [
                    {
                        label: 'About Financial Cents Timer',
                        click: () => {
                            this.showAbout();
                        }
                    },
                    {
                        label: 'Check for Updates',
                        click: () => {
                            autoUpdater.checkForUpdatesAndNotify();
                        }
                    },
                    {
                        label: 'View Logs',
                        click: () => {
                            shell.openPath(log.transports.file.getFile().path);
                        }
                    },
                    {
                        label: 'Open Analytics Dashboard',
                        click: () => {
                            this.openAnalyticsDashboard();
                        }
                    }
                ]
            }
        ];

        // macOS specific menu adjustments
        if (process.platform === 'darwin') {
            template.unshift({
                label: app.getName(),
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            });
        }

        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
    }

    setupGlobalShortcuts() {
        // Global shortcut to show/hide window
        globalShortcut.register('CmdOrCtrl+Shift+T', () => {
            if (this.mainWindow?.isVisible()) {
                this.mainWindow.hide();
            } else {
                this.showWindow();
            }
        });

        // Global shortcut to start/stop timer
        globalShortcut.register('CmdOrCtrl+Shift+S', () => {
            this.mainWindow?.webContents.send('toggle-timer');
        });
    }

    setupIpcHandlers() {
        // App control
        ipcMain.handle('app:getVersion', () => app.getVersion());
        ipcMain.handle('app:getPlatform', () => process.platform);
        ipcMain.handle('app:quit', () => {
            this.isQuitting = true;
            app.quit();
        });

        // Window control
        ipcMain.handle('window:minimize', () => {
            this.mainWindow?.minimize();
        });

        ipcMain.handle('window:hide', () => {
            this.mainWindow?.hide();
        });

        ipcMain.handle('window:show', () => {
            this.showWindow();
        });

        ipcMain.handle('window:toggleAlwaysOnTop', () => {
            const current = this.mainWindow?.isAlwaysOnTop();
            this.mainWindow?.setAlwaysOnTop(!current);
            store.set('alwaysOnTop', !current);
            return !current;
        });

        // Settings
        ipcMain.handle('settings:get', (event, key) => {
            return store.get(key);
        });

        ipcMain.handle('settings:set', (event, key, value) => {
            store.set(key, value);
            if (key === 'serverUrl') {
                this.serverUrl = value;
            }
        });

        ipcMain.handle('settings:getAll', () => {
            return store.store;
        });

        // Network requests (with proper error handling)
        ipcMain.handle('api:request', async (event, options) => {
            return await this.makeApiRequest(options);
        });

        // Window tracking
        ipcMain.handle('windowTracking:getRules', () => {
            return this.rules;
        });

        ipcMain.handle('windowTracking:addRule', (event, rule) => {
            return this.addWindowTrackingRule(rule);
        });

        ipcMain.handle('windowTracking:updateRule', (event, id, updates) => {
            return this.updateWindowTrackingRule(id, updates);
        });

        ipcMain.handle('windowTracking:deleteRule', (event, id) => {
            return this.deleteWindowTrackingRule(id);
        });

        ipcMain.handle('windowTracking:getAnalytics', () => {
            return this.getWindowAnalytics();
        });

        // Sync operations
        ipcMain.handle('sync:force', () => {
            return this.forceSync();
        });

        ipcMain.handle('sync:status', () => {
            return this.getSyncStatus();
        });

        ipcMain.handle('sync:getQueue', () => {
            return this.offlineQueue;
        });

        // File operations
        ipcMain.handle('file:export', async (event, data, filename) => {
            return await this.exportToFile(data, filename);
        });

        // Notifications
        ipcMain.handle('notification:show', (event, options) => {
            return this.showNotification(options);
        });

        // System integration
        ipcMain.handle('system:openExternal', (event, url) => {
            shell.openExternal(url);
        });

        // Analytics
        ipcMain.handle('analytics:getProductivity', () => {
            return this.calculateProductivityMetrics();
        });

        ipcMain.handle('analytics:getPatterns', () => {
            return this.getUsagePatterns();
        });

        // Current session management
        ipcMain.handle('session:getCurrent', () => {
            return this.currentSession;
        });

        ipcMain.handle('session:start', (event, projectId, description) => {
            return this.startSession(projectId, description);
        });

        ipcMain.handle('session:stop', () => {
            return this.stopSession();
        });
    }

    // Window Tracking Implementation
    async startWindowTracking() {
        if (!store.get('windowTracking.enabled') || this.windowTrackingInterval) return;

        const checkInterval = store.get('windowTracking.checkInterval', 5000);
        
        this.windowTrackingInterval = setInterval(async () => {
            try {
                const activeWindow = await activeWin();
                if (activeWindow) {
                    await this.processActiveWindow(activeWindow);
                }
            } catch (error) {
                log.error('Window tracking error:', error);
            }
        }, checkInterval);

        log.info('Window tracking started');
    }

    stopWindowTracking() {
        if (this.windowTrackingInterval) {
            clearInterval(this.windowTrackingInterval);
            this.windowTrackingInterval = null;
            log.info('Window tracking stopped');
        }
    }

    async processActiveWindow(activeWindow) {
        const now = Date.now();
        const minWindowTime = store.get('windowTracking.minWindowTime', 30000);
        
        // Check if window changed
        if (this.currentActiveWindow && 
            (this.currentActiveWindow.title !== activeWindow.title || 
             this.currentActiveWindow.owner.name !== activeWindow.owner.name)) {
            
            // Process previous window if it was active long enough
            if (this.windowStartTime && (now - this.windowStartTime) >= minWindowTime) {
                await this.recordWindowEvent(this.currentActiveWindow, this.windowStartTime, now);
            }
        }

        // Update current window
        if (!this.currentActiveWindow || 
            this.currentActiveWindow.title !== activeWindow.title || 
            this.currentActiveWindow.owner.name !== activeWindow.owner.name) {
            
            this.currentActiveWindow = activeWindow;
            this.windowStartTime = now;

            // Check for matching rules
            await this.checkWindowRules(activeWindow);
        }

        // Record analytics
        this.updateAnalytics(activeWindow);
    }

    async checkWindowRules(activeWindow) {
        for (const rule of this.rules) {
            if (!rule.enabled) continue;

            if (await this.matchesRule(activeWindow, rule)) {
                await this.executeRule(rule, activeWindow);
                break; // Execute only the first matching rule
            }
        }
    }

    async matchesRule(activeWindow, rule) {
        const { conditions } = rule;
        
        // Domain matching
        if (conditions.domain) {
            const url = activeWindow.url || '';
            if (!url.includes(conditions.domain)) return false;
        }

        // Title pattern matching
        if (conditions.titlePattern) {
            const regex = new RegExp(conditions.titlePattern, 'i');
            if (!regex.test(activeWindow.title)) return false;
        }

        // App name matching
        if (conditions.appName) {
            if (!activeWindow.owner.name.toLowerCase().includes(conditions.appName.toLowerCase())) {
                return false;
            }
        }

        // Time-based conditions
        if (conditions.timeConditions?.enabled) {
            if (!this.matchesTimeConditions(conditions.timeConditions)) return false;
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
            
            if (currentHour < startHour || currentHour > endHour) return false;
        }

        // Check days of week
        if (timeConditions.daysOfWeek && timeConditions.daysOfWeek.length > 0) {
            if (!timeConditions.daysOfWeek.includes(currentDay)) return false;
        }

        return true;
    }

    async executeRule(rule, activeWindow) {
        const { actionConfig } = rule;
        
        switch (actionConfig.action) {
            case 'start_timer':
                if (!this.currentSession || this.currentSession.projectId !== actionConfig.projectId) {
                    await this.startSession(actionConfig.projectId, actionConfig.description || activeWindow.title);
                    
                    if (actionConfig.notifyUser) {
                        this.showNotification({
                            title: 'Timer Started',
                            body: `Started tracking: ${actionConfig.description || activeWindow.title}`,
                            onClick: () => this.showWindow()
                        });
                    }
                }
                break;

            case 'switch_project':
                if (this.currentSession && this.currentSession.projectId !== actionConfig.projectId) {
                    await this.stopSession();
                    await this.startSession(actionConfig.projectId, actionConfig.description || activeWindow.title);
                    
                    if (actionConfig.notifyUser) {
                        this.showNotification({
                            title: 'Project Switched',
                            body: `Switched to: ${actionConfig.description || activeWindow.title}`
                        });
                    }
                }
                break;

            case 'suggest_project':
                if (!this.currentSession) {
                    this.showNotification({
                        title: 'Project Suggestion',
                        body: `Start tracking: ${actionConfig.description || activeWindow.title}?`,
                        onClick: () => {
                            this.showWindow();
                            this.mainWindow?.webContents.send('suggest-project', actionConfig.projectId);
                        }
                    });
                }
                break;

            case 'pause_timer':
                if (this.currentSession) {
                    await this.pauseSession();
                    
                    if (actionConfig.notifyUser) {
                        this.showNotification({
                            title: 'Timer Paused',
                            body: 'Timer paused due to detected distraction'
                        });
                    }
                }
                break;
        }

        // Update rule analytics
        await this.updateRuleAnalytics(rule.id, true, activeWindow);
    }

    // Session Management
    async startSession(projectId, description = '') {
        try {
            // Stop current session if exists
            if (this.currentSession) {
                await this.stopSession();
            }

            const sessionData = {
                projectId,
                description,
                startTime: new Date().toISOString(),
                source: 'desktop_app',
                metadata: {
                    windowData: this.currentActiveWindow ? {
                        title: this.currentActiveWindow.title,
                        app: this.currentActiveWindow.owner.name,
                        url: this.currentActiveWindow.url
                    } : null,
                    deviceInfo: {
                        platform: process.platform,
                        version: app.getVersion()
                    }
                }
            };

            // Try to sync with server
            if (await this.isOnline()) {
                const result = await this.makeApiRequest({
                    method: 'POST',
                    path: '/time-entries',
                    body: {
                        ...sessionData,
                        status: 'running'
                    }
                });

                if (result.success) {
                    this.currentSession = { ...sessionData, id: result.data.id };
                } else {
                    throw new Error('Server request failed');
                }
            } else {
                // Queue for offline sync
                this.currentSession = { ...sessionData, id: `local_${Date.now()}` };
                this.queueOfflineAction('start_session', sessionData);
            }

            // Update UI
            this.updateTrayIcon();
            this.mainWindow?.webContents.send('session-started', this.currentSession);

            log.info('Session started:', this.currentSession.id);
            return { success: true, session: this.currentSession };

        } catch (error) {
            log.error('Failed to start session:', error);
            return { success: false, error: error.message };
        }
    }

    async stopSession() {
        if (!this.currentSession) return { success: false, error: 'No active session' };

        try {
            const endTime = new Date().toISOString();
            const duration = new Date(endTime) - new Date(this.currentSession.startTime);

            const sessionUpdate = {
                ...this.currentSession,
                endTime,
                duration,
                status: 'completed'
            };

            // Try to sync with server
            if (await this.isOnline()) {
                const result = await this.makeApiRequest({
                    method: 'PUT',
                    path: `/time-entries/${this.currentSession.id}`,
                    body: sessionUpdate
                });

                if (!result.success) {
                    throw new Error('Server request failed');
                }
            } else {
                // Queue for offline sync
                this.queueOfflineAction('stop_session', sessionUpdate);
            }

            // Clear current session
            const stoppedSession = this.currentSession;
            this.currentSession = null;

            // Update UI
            this.updateTrayIcon();
            this.mainWindow?.webContents.send('session-stopped', stoppedSession);

            log.info('Session stopped:', stoppedSession.id);
            return { success: true, session: stoppedSession };

        } catch (error) {
            log.error('Failed to stop session:', error);
            return { success: false, error: error.message };
        }
    }

    // Analytics and Pattern Recognition
    updateAnalytics(activeWindow) {
        const now = Date.now();
        
        // Record window event
        this.analytics.windowEvents.push({
            timestamp: now,
            title: activeWindow.title,
            app: activeWindow.owner.name,
            url: activeWindow.url,
            productivity: this.calculateWindowProductivity(activeWindow),
            focus: this.calculateFocusScore(activeWindow)
        });

        // Limit analytics history
        if (this.analytics.windowEvents.length > 1000) {
            this.analytics.windowEvents = this.analytics.windowEvents.slice(-500);
        }

        // Update patterns
        this.updateUsagePatterns(activeWindow);
    }

    calculateWindowProductivity(activeWindow) {
        const productiveApps = ['Visual Studio Code', 'Figma', 'Slack', 'Microsoft Excel', 'Google Chrome'];
        const distractingApps = ['Netflix', 'YouTube', 'Twitter', 'Facebook', 'Instagram'];
        
        const appName = activeWindow.owner.name;
        
        if (productiveApps.some(app => appName.includes(app))) return 1;
        if (distractingApps.some(app => appName.includes(app))) return -1;
        
        return 0; // Neutral
    }

    calculateFocusScore(activeWindow) {
        // Focus score based on window switching frequency
        const recentEvents = this.analytics.windowEvents.slice(-10);
        const uniqueApps = new Set(recentEvents.map(e => e.app)).size;
        
        return Math.max(0, 1 - (uniqueApps / 10)); // Higher score = less switching
    }

    updateUsagePatterns(activeWindow) {
        const hour = new Date().getHours();
        const app = activeWindow.owner.name;
        
        // Update hourly patterns
        const hourKey = `hour_${hour}`;
        if (!this.analytics.patterns.has(hourKey)) {
            this.analytics.patterns.set(hourKey, new Map());
        }
        
        const hourlyApps = this.analytics.patterns.get(hourKey);
        hourlyApps.set(app, (hourlyApps.get(app) || 0) + 1);
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
        const queueLimit = store.get('sync.offlineQueueLimit', 100);
        if (this.offlineQueue.length > queueLimit) {
            this.offlineQueue = this.offlineQueue.slice(-queueLimit);
        }
    }

    async processOfflineQueue() {
        if (this.offlineQueue.length === 0) return;

        const processedItems = [];
        
        for (const item of this.offlineQueue) {
            try {
                let result = false;

                switch (item.action) {
                    case 'start_session':
                        result = await this.makeApiRequest({
                            method: 'POST',
                            path: '/time-entries',
                            body: { ...item.data, status: 'completed' } // Mark as completed since we're syncing after the fact
                        });
                        break;

                    case 'stop_session':
                        result = await this.makeApiRequest({
                            method: 'PUT',
                            path: `/time-entries/${item.data.id}`,
                            body: item.data
                        });
                        break;

                    case 'window_event':
                        result = await this.makeApiRequest({
                            method: 'POST',
                            path: '/analytics/window-events',
                            body: item.data
                        });
                        break;
                }

                if (result.success) {
                    processedItems.push(item.id);
                }

            } catch (error) {
                log.error('Failed to process offline queue item:', error);
                break; // Stop processing if we encounter an error
            }
        }

        // Remove processed items
        this.offlineQueue = this.offlineQueue.filter(item => !processedItems.includes(item.id));
        
        if (processedItems.length > 0) {
            log.info(`Processed ${processedItems.length} offline queue items`);
        }
    }

    // Utility Methods
    async makeApiRequest(options) {
        const { method = 'GET', path, body, headers = {} } = options;
        
        try {
            const url = `${this.serverUrl}${path}`;
            const config = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Keep-Alive': 'desktop-app',
                    ...headers
                }
            };

            if (body && method !== 'GET') {
                config.body = JSON.stringify(body);
            }

            log.info(`API Request: ${method} ${url}`);
            
            const response = await fetch(url, config);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            log.info(`API Response: ${response.status}`);
            
            return { success: true, data, status: response.status };

        } catch (error) {
            log.error('API Request failed:', error);
            return { success: false, error: error.message };
        }
    }

    async isOnline() {
        try {
            const result = await this.makeApiRequest({
                method: 'GET',
                path: '/health'
            });
            return result.success;
        } catch (error) {
            return false;
        }
    }

    async forceSync() {
        this.mainWindow?.webContents.send('sync:start');
        
        try {
            // Process offline queue
            await this.processOfflineQueue();
            
            // Sync current session
            if (this.currentSession) {
                await this.syncCurrentSession();
            }
            
            // Load latest data
            await this.loadWindowTrackingRules();
            
            this.lastSync = Date.now();
            this.mainWindow?.webContents.send('sync:success', {
                timestamp: this.lastSync,
                queueItems: this.offlineQueue.length
            });
            
            log.info('Force sync completed');
            
        } catch (error) {
            log.error('Force sync failed:', error);
            this.mainWindow?.webContents.send('sync:error', {
                error: error.message
            });
        }
    }

    cleanup() {
        // Clear intervals
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }
        
        if (this.windowTrackingInterval) {
            clearInterval(this.windowTrackingInterval);
        }

        // Unregister global shortcuts
        globalShortcut.unregisterAll();

        // Save current state
        this.saveWindowBounds();
        
        log.info('App cleanup completed');
    }

    // ... Additional helper methods would continue here ...
    // (showWindow, saveWindowBounds, showNotification, etc.)
}

// Initialize the app
const financialCentsApp = new FinancialCentsApp();

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    log.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

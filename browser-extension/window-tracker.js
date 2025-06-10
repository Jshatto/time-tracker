// browser-extension/window-tracker.js
class ExtensionWindowTracker {
    constructor(extension) {
        this.extension = extension;
        this.currentTab = null;
        this.lastActivity = Date.now();
        this.activityHistory = [];
        this.rules = [];
        this.isTracking = false;
    }

    async init() {
        console.log('👁️ Initializing Extension Window Tracker...');
        
        // Load tracking rules
        await this.loadRules();
        
        // Setup tab listeners
        this.setupTabListeners();
        
        // Start tracking if enabled
        const enabled = await this.getSetting('windowTracking.enabled', true);
        if (enabled) {
            this.startTracking();
        }
        
        console.log('✅ Extension Window Tracker initialized');
    }

    setupTabListeners() {
        // Tab activation
        chrome.tabs.onActivated.addListener(async (activeInfo) => {
            const tab = await chrome.tabs.get(activeInfo.tabId);
            await this.processTabChange(tab, 'activated');
        });

        // Tab updates
        chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                await this.processTabChange(tab, 'updated');
            }
        });

        // Window focus changes
        chrome.windows.onFocusChanged.addListener(async (windowId) => {
            if (windowId !== chrome.windows.WINDOW_ID_NONE) {
                const tabs = await chrome.tabs.query({ active: true, windowId });
                if (tabs[0]) {
                    await this.processTabChange(tabs[0], 'focus_changed');
                }
            }
        });
    }

    async processTabChange(tab, eventType) {
        if (!this.isTracking || !tab.url || tab.url.startsWith('chrome://')) {
            return;
        }

        const urlInfo = this.parseUrl(tab.url);
        const activity = {
            timestamp: Date.now(),
            eventType,
            url: tab.url,
            title: tab.title,
            domain: urlInfo.domain,
            category: this.categorizeTab(tab, urlInfo),
            tabId: tab.id
        };

        // Record activity
        this.recordActivity(activity);

        // Check rules
        await this.checkRules(tab, urlInfo, activity);

        // Update current tab
        this.currentTab = tab;
        this.lastActivity = Date.now();
    }

    recordActivity(activity) {
        this.activityHistory.push(activity);
        
        // Keep only recent history (last 100 activities)
        if (this.activityHistory.length > 100) {
            this.activityHistory = this.activityHistory.slice(-100);
        }

        // Store in chrome storage for persistence
        chrome.storage.local.set({
            windowActivity: this.activityHistory.slice(-50) // Store last 50
        });

        // Send to analytics
        this.extension.analytics?.recordEvent('window_change', activity);
    }

    parseUrl(url) {
        try {
            const urlObj = new URL(url);
            return {
                domain: urlObj.hostname,
                subdomain: urlObj.hostname.split('.').slice(0, -2).join('.'),
                path: urlObj.pathname,
                query: urlObj.search,
                protocol: urlObj.protocol
            };
        } catch (error) {
            return {
                domain: 'unknown',
                subdomain: '',
                path: '',
                query: '',
                protocol: ''
            };
        }
    }

    categorizeTab(tab, urlInfo) {
        const domain = urlInfo.domain.toLowerCase();
        const title = tab.title.toLowerCase();

        // Development
        if (/github|gitlab|stackoverflow|codepen|jsfiddle/.test(domain) ||
            /vs\s*code|visual\s*studio/.test(title)) {
            return 'development';
        }

        // Design
        if (/figma|sketch|dribbble|behance/.test(domain)) {
            return 'design';
        }

        // Communication
        if (/slack|discord|teams|zoom|meet/.test(domain)) {
            return 'communication';
        }

        // Social Media
        if (/facebook|twitter|instagram|linkedin|reddit/.test(domain)) {
            return 'social_media';
        }

        // Entertainment
        if (/youtube|netflix|spotify|twitch/.test(domain)) {
            return 'entertainment';
        }

        // Productivity
        if (/notion|asana|trello|todoist|google\s*docs/.test(domain) ||
            /docs\.google|sheets\.google/.test(domain)) {
            return 'productivity';
        }

        return 'general';
    }

    async checkRules(tab, urlInfo, activity) {
        for (const rule of this.rules) {
            if (!rule.enabled) continue;

            if (await this.matchesRule(tab, urlInfo, rule)) {
                await this.executeRule(rule, tab, urlInfo, activity);
                break; // Execute only first matching rule
            }
        }
    }

    async matchesRule(tab, urlInfo, rule) {
        const { conditions } = rule;

        // Domain matching
        if (conditions.domain && !urlInfo.domain.includes(conditions.domain)) {
            return false;
        }

        // Title pattern
        if (conditions.titlePattern) {
            const regex = new RegExp(conditions.titlePattern, 'i');
            if (!regex.test(tab.title)) {
                return false;
            }
        }

        // URL pattern
        if (conditions.urlPattern) {
            const regex = new RegExp(conditions.urlPattern, 'i');
            if (!regex.test(tab.url)) {
                return false;
            }
        }

        return true;
    }

    async executeRule(rule, tab, urlInfo, activity) {
        const { actionConfig } = rule;

        console.log(`🎯 Executing rule: ${rule.name} for ${urlInfo.domain}`);

        switch (actionConfig.action) {
            case 'start_timer':
                if (!this.extension.state.activeTimer) {
                    await this.extension.startTimer({
                        projectId: actionConfig.projectId,
                        description: actionConfig.description || tab.title,
                        source: 'window_rule',
                        ruleId: rule.id,
                        confidence: actionConfig.confidence
                    });
                }
                break;

            case 'suggest_project':
                if (!this.extension.state.activeTimer) {
                    await this.extension.showNotification({
                        title: 'Project Suggestion',
                        message: `Start tracking: ${actionConfig.description || tab.title}?`,
                        type: 'suggestion',
                        data: {
                            projectId: actionConfig.projectId,
                            description: actionConfig.description || tab.title
                        }
                    });
                }
                break;

            case 'switch_project':
                if (this.extension.state.activeTimer && 
                    this.extension.state.activeTimer.projectId !== actionConfig.projectId) {
                    await this.extension.stopTimer({ source: 'rule' });
                    await this.extension.startTimer({
                        projectId: actionConfig.projectId,
                        description: actionConfig.description || tab.title,
                        source: 'window_rule'
                    });
                }
                break;
        }

        // Update rule analytics
        await this.updateRuleAnalytics(rule.id, true);
    }

    async loadRules() {
        try {
            const stored = await chrome.storage.local.get(['windowRules']);
            this.rules = stored.windowRules || [
                // Default rule
                {
                    id: 'github-dev',
                    name: 'GitHub Development',
                    enabled: true,
                    conditions: {
                        domain: 'github.com'
                    },
                    actionConfig: {
                        action: 'suggest_project',
                        projectId: 'development',
                        description: 'Development work',
                        confidence: 0.8
                    }
                }
            ];
        } catch (error) {
            console.error('Error loading rules:', error);
            this.rules = [];
        }
    }

    async updateRuleAnalytics(ruleId, triggered) {
        try {
            const analytics = await chrome.storage.local.get(['ruleAnalytics']) || {};
            if (!analytics.ruleAnalytics) analytics.ruleAnalytics = {};

            if (!analytics.ruleAnalytics[ruleId]) {
                analytics.ruleAnalytics[ruleId] = {
                    triggerCount: 0,
                    lastTriggered: null
                };
            }

            if (triggered) {
                analytics.ruleAnalytics[ruleId].triggerCount++;
                analytics.ruleAnalytics[ruleId].lastTriggered = Date.now();
            }

            await chrome.storage.local.set({ ruleAnalytics: analytics.ruleAnalytics });
        } catch (error) {
            console.error('Error updating rule analytics:', error);
        }
    }

    async getSetting(key, defaultValue) {
        try {
            const stored = await chrome.storage.local.get(['settings']);
            const settings = stored.settings || {};
            const keys = key.split('.');
            let value = settings;
            
            for (const k of keys) {
                value = value?.[k];
            }
            
            return value !== undefined ? value : defaultValue;
        } catch (error) {
            return defaultValue;
        }
    }

    startTracking() {
        this.isTracking = true;
        console.log('🔍 Window tracking started');
    }

    stopTracking() {
        this.isTracking = false;
        console.log('⏹️ Window tracking stopped');
    }

    getAnalytics() {
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const recentActivity = this.activityHistory.filter(a => now - a.timestamp < oneHour);

        return {
            totalSwitches: this.activityHistory.length,
            recentSwitches: recentActivity.length,
            uniqueDomains: new Set(this.activityHistory.map(a => a.domain)).size,
            topDomains: this.getTopDomains(recentActivity),
            categories: this.getCategoryBreakdown(recentActivity)
        };
    }

    getTopDomains(activities) {
        const counts = {};
        activities.forEach(a => {
            counts[a.domain] = (counts[a.domain] || 0) + 1;
        });

        return Object.entries(counts)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5)
            .map(([domain, count]) => ({ domain, count }));
    }

    getCategoryBreakdown(activities) {
        const counts = {};
        activities.forEach(a => {
            counts[a.category] = (counts[a.category] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([category, count]) => ({ category, count }));
    }
}

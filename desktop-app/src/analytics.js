
// desktop-app/src/analytics.js
class DesktopAnalytics {
    constructor() {
        this.localData = {
            sessions: [],
            windowEvents: [],
            productivity: {},
            patterns: new Map()
        };
        
        this.insights = [];
        this.reportCache = new Map();
        
        this.init();
    }
    
    async init() {
        console.log('📊 Initializing Desktop Analytics...');
        
        // Load local analytics data
        await this.loadLocalData();
        
        // Start analytics collection
        this.startDataCollection();
        
        console.log('✅ Desktop Analytics initialized');
    }
    
    async loadLocalData() {
        try {
            if (window.electronAPI && window.electronAPI.settings) {
                const stored = await window.electronAPI.settings.get('analyticsData');
                if (stored) {
                    this.localData = { ...this.localData, ...stored };
                }
            }
        } catch (error) {
            console.error('Error loading local analytics data:', error);
        }
    }
    
    async saveLocalData() {
        try {
            if (window.electronAPI && window.electronAPI.settings) {
                await window.electronAPI.settings.set('analyticsData', this.localData);
            }
        } catch (error) {
            console.error('Error saving local analytics data:', error);
        }
    }
    
    startDataCollection() {
        // Collect data every minute
        setInterval(() => {
            this.collectCurrentState();
        }, 60000);
        
        // Generate daily insights
        setInterval(() => {
            this.generateDailyInsights();
        }, 24 * 60 * 60 * 1000); // Once per day
    }
    
    async collectCurrentState() {
        try {
            if (window.electronAPI) {
                // Get current session info
                const session = await window.electronAPI.session.getCurrent();
                if (session) {
                    this.recordSession(session);
                }
                
                // Get window tracking analytics
                const windowAnalytics = await window.electronAPI.windowTracking.getAnalytics();
                if (windowAnalytics) {
                    this.processWindowAnalytics(windowAnalytics);
                }
            }
        } catch (error) {
            console.error('Error collecting analytics state:', error);
        }
    }
    
    recordSession(session) {
        const sessionData = {
            id: session.id,
            projectId: session.projectId,
            startTime: session.startTime,
            duration: session.duration || (Date.now() - new Date(session.startTime)),
            productivity: session.metadata?.productivity || 0,
            focus: session.metadata?.focus || 0.5,
            source: session.metadata?.source || 'manual',
            timestamp: Date.now()
        };
        
        // Add to local sessions
        this.localData.sessions.push(sessionData);
        
        // Keep only recent sessions (last 1000)
        if (this.localData.sessions.length > 1000) {
            this.localData.sessions = this.localData.sessions.slice(-1000);
        }
        
        // Save data
        this.saveLocalData();
    }
    
    processWindowAnalytics(windowAnalytics) {
        // Store window analytics
        this.localData.windowEvents.push({
            timestamp: Date.now(),
            ...windowAnalytics
        });
        
        // Keep only recent events
        if (this.localData.windowEvents.length > 500) {
            this.localData.windowEvents = this.localData.windowEvents.slice(-500);
        }
        
        // Update productivity metrics
        this.updateProductivityMetrics(windowAnalytics);
    }
    
    updateProductivityMetrics(analytics) {
        const today = new Date().toISOString().split('T')[0];
        
        if (!this.localData.productivity[today]) {
            this.localData.productivity[today] = {
                totalTime: 0,
                productiveTime: 0,
                distractedTime: 0,
                focusScore: 0,
                switches: 0
            };
        }
        
        const dailyMetrics = this.localData.productivity[today];
        
        // Update metrics based on window analytics
        if (analytics.today) {
            dailyMetrics.totalTime = analytics.today.totalTime || 0;
            dailyMetrics.productiveTime = analytics.today.productiveTime || 0;
            dailyMetrics.focusScore = analytics.today.averageSessionTime || 0;
            dailyMetrics.switches = analytics.today.windowSwitches || 0;
        }
        
        this.saveLocalData();
    }
    
    generateDailyInsights() {
        const insights = [];
        const today = new Date().toISOString().split('T')[0];
        const todayMetrics = this.localData.productivity[today];
        
        if (!todayMetrics) return;
        
        // Productivity insight
        const productivityScore = todayMetrics.totalTime > 0 ? 
            (todayMetrics.productiveTime / todayMetrics.totalTime) * 100 : 0;
        
        if (productivityScore > 70) {
            insights.push({
                type: 'productivity_high',
                title: 'High Productivity Day',
                description: `You had a productive day with ${Math.round(productivityScore)}% productive time!`,
                score: productivityScore,
                date: today
            });
        } else if (productivityScore < 40) {
            insights.push({
                type: 'productivity_low',
                title: 'Productivity Opportunity',
                description: `Your productivity was ${Math.round(productivityScore)}%. Consider reducing distractions.`,
                score: productivityScore,
                date: today
            });
        }
        
        // Focus insight
        if (todayMetrics.switches > 50) {
            insights.push({
                type: 'focus_switches',
                title: 'High Context Switching',
                description: `You switched between windows ${todayMetrics.switches} times. Try to minimize interruptions.`,
                score: todayMetrics.switches,
                date: today
            });
        }
        
        // Time insight
        const totalHours = todayMetrics.totalTime / (1000 * 60 * 60);
        if (totalHours > 8) {
            insights.push({
                type: 'time_long',
                title: 'Long Work Day',
                description: `You worked for ${Math.round(totalHours)} hours today. Don't forget to take breaks!`,
                score: totalHours,
                date: today
            });
        }
        
        this.insights = insights;
        this.saveLocalData();
    }
    
    getDailyReport(date = null) {
        const targetDate = date || new Date().toISOString().split('T')[0];
        const dailyMetrics = this.localData.productivity[targetDate];
        
        if (!dailyMetrics) {
            return {
                date: targetDate,
                totalTime: 0,
                productiveTime: 0,
                productivityScore: 0,
                focusScore: 0,
                switches: 0,
                sessions: []
            };
        }
        
        // Get sessions for this date
        const dailySessions = this.localData.sessions.filter(session => {
            const sessionDate = new Date(session.startTime).toISOString().split('T')[0];
            return sessionDate === targetDate;
        });
        
        return {
            date: targetDate,
            totalTime: dailyMetrics.totalTime,
            productiveTime: dailyMetrics.productiveTime,
            productivityScore: dailyMetrics.totalTime > 0 ? 
                (dailyMetrics.productiveTime / dailyMetrics.totalTime) * 100 : 0,
            focusScore: dailyMetrics.focusScore,
            switches: dailyMetrics.switches,
            sessions: dailySessions
        };
    }
    
    getWeeklyReport() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 7);
        
        return this.getDateRangeReport(startDate, endDate);
    }
    
    getMonthlyReport() {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(endDate.getMonth() - 1);
        
        return this.getDateRangeReport(startDate, endDate);
    }
    
    getDateRangeReport(startDate, endDate) {
        const cacheKey = `${startDate.toISOString()}_${endDate.toISOString()}`;
        
        if (this.reportCache.has(cacheKey)) {
            return this.reportCache.get(cacheKey);
        }
        
        const sessions = this.localData.sessions.filter(session => {
            const sessionDate = new Date(session.startTime);
            return sessionDate >= startDate && sessionDate <= endDate;
        });
        
        const totalTime = sessions.reduce((sum, session) => sum + session.duration, 0);
        const productiveSessions = sessions.filter(session => session.productivity > 0);
        const productiveTime = productiveSessions.reduce((sum, session) => sum + session.duration, 0);
        
        // Project breakdown
        const projectBreakdown = {};
        sessions.forEach(session => {
            if (!projectBreakdown[session.projectId]) {
                projectBreakdown[session.projectId] = {
                    totalTime: 0,
                    sessionCount: 0
                };
            }
            projectBreakdown[session.projectId].totalTime += session.duration;
            projectBreakdown[session.projectId].sessionCount++;
        });
        
        // Daily breakdown
        const dailyBreakdown = {};
        sessions.forEach(session => {
            const date = new Date(session.startTime).toISOString().split('T')[0];
            if (!dailyBreakdown[date]) {
                dailyBreakdown[date] = {
                    totalTime: 0,
                    sessionCount: 0,
                    productivity: 0
                };
            }
            dailyBreakdown[date].totalTime += session.duration;
            dailyBreakdown[date].sessionCount++;
            dailyBreakdown[date].productivity += session.productivity;
        });
        
        // Calculate averages for daily breakdown
        Object.values(dailyBreakdown).forEach(day => {
            day.productivity = day.sessionCount > 0 ? day.productivity / day.sessionCount : 0;
        });
        
        const report = {
            period: {
                start: startDate.toISOString(),
                end: endDate.toISOString()
            },
            summary: {
                totalTime,
                productiveTime,
                productivityScore: totalTime > 0 ? (productiveTime / totalTime) * 100 : 0,
                sessionCount: sessions.length,
                averageSessionTime: sessions.length > 0 ? totalTime / sessions.length : 0,
                uniqueDays: Object.keys(dailyBreakdown).length
            },
            projectBreakdown: Object.entries(projectBreakdown).map(([projectId, data]) => ({
                projectId,
                ...data
            })),
            dailyBreakdown: Object.entries(dailyBreakdown).map(([date, data]) => ({
                date,
                ...data
            })).sort((a, b) => a.date.localeCompare(b.date)),
            insights: this.insights.filter(insight => {
                const insightDate = new Date(insight.date);
                return insightDate >= startDate && insightDate <= endDate;
            })
        };
        
        // Cache the report for 5 minutes
        this.reportCache.set(cacheKey, report);
        setTimeout(() => {
            this.reportCache.delete(cacheKey);
        }, 5 * 60 * 1000);
        
        return report;
    }
    
    detectPatterns() {
        const patterns = [];
        
        // Detect peak productivity hours
        const hourlyProductivity = {};
        this.localData.sessions.forEach(session => {
            const hour = new Date(session.startTime).getHours();
            if (!hourlyProductivity[hour]) {
                hourlyProductivity[hour] = {
                    totalTime: 0,
                    productiveTime: 0,
                    sessionCount: 0
                };
            }
            
            hourlyProductivity[hour].totalTime += session.duration;
            hourlyProductivity[hour].sessionCount++;
            
            if (session.productivity > 0) {
                hourlyProductivity[hour].productiveTime += session.duration;
            }
        });
        
        // Find peak hour
        let peakHour = -1;
        let maxProductivity = 0;
        
        Object.entries(hourlyProductivity).forEach(([hour, data]) => {
            const productivity = data.totalTime > 0 ? data.productiveTime / data.totalTime : 0;
            if (productivity > maxProductivity && data.sessionCount >= 3) {
                maxProductivity = productivity;
                peakHour = parseInt(hour);
            }
        });
        
        if (peakHour >= 0) {
            patterns.push({
                type: 'peak_hours',
                description: `You're most productive around ${peakHour}:00`,
                confidence: maxProductivity,
                data: { hour: peakHour, productivity: maxProductivity }
            });
        }
        
        // Detect favorite projects
        const projectTime = {};
        this.localData.sessions.forEach(session => {
            projectTime[session.projectId] = (projectTime[session.projectId] || 0) + session.duration;
        });
        
        const topProject = Object.entries(projectTime)
            .sort(([,a], [,b]) => b - a)[0];
        
        if (topProject && Object.keys(projectTime).length > 1) {
            const totalTime = Object.values(projectTime).reduce((sum, time) => sum + time, 0);
            const percentage = (topProject[1] / totalTime) * 100;
            
            patterns.push({
                type: 'project_preference',
                description: `You spend ${Math.round(percentage)}% of your time on your main project`,
                confidence: percentage / 100,
                data: { projectId: topProject[0], percentage }
            });
        }
        
        return patterns;
    }
    
    getProductivityTrends(days = 30) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - days);
        
        const trends = [];
        
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayMetrics = this.localData.productivity[dateStr];
            
            trends.push({
                date: dateStr,
                productivity: dayMetrics ? (dayMetrics.totalTime > 0 ? 
                    (dayMetrics.productiveTime / dayMetrics.totalTime) * 100 : 0) : 0,
                totalTime: dayMetrics ? dayMetrics.totalTime : 0,
                switches: dayMetrics ? dayMetrics.switches : 0
            });
        }
        
        return trends;
    }
    
    exportAnalytics() {
        return {
            summary: {
                totalSessions: this.localData.sessions.length,
                totalWindowEvents: this.localData.windowEvents.length,
                dateRange: {
                    earliest: this.localData.sessions.length > 0 ? 
                        Math.min(...this.localData.sessions.map(s => new Date(s.startTime))) : null,
                    latest: this.localData.sessions.length > 0 ? 
                        Math.max(...this.localData.sessions.map(s => new Date(s.startTime))) : null
                }
            },
            sessions: this.localData.sessions,
            productivity: this.localData.productivity,
            insights: this.insights,
            patterns: this.detectPatterns(),
            exportedAt: new Date().toISOString()
        };
    }
    
    clearOldData(daysToKeep = 90) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
        
        // Clear old sessions
        this.localData.sessions = this.localData.sessions.filter(session => 
            new Date(session.startTime) > cutoffDate
        );
        
        // Clear old window events
        this.localData.windowEvents = this.localData.windowEvents.filter(event => 
            new Date(event.timestamp) > cutoffDate
        );
        
        // Clear old productivity data
        const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
        Object.keys(this.localData.productivity).forEach(date => {
            if (date < cutoffDateStr) {
                delete this.localData.productivity[date];
            }
        });
        
        this.saveLocalData();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DesktopAnalytics;
} else {
    window.DesktopAnalytics = DesktopAnalytics;
}
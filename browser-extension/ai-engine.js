// browser-extension/ai-engine.js
class ExtensionAIEngine {
    constructor(extension) {
        this.extension = extension;
        this.patterns = new Map();
        this.suggestions = [];
        this.confidenceThreshold = 0.7;
        this.learningData = {
            acceptedSuggestions: 0,
            rejectedSuggestions: 0,
            patternMatches: new Map()
        };
    }

    async init() {
        console.log('🧠 Initializing AI Engine...');
        
        // Load learned patterns
        await this.loadLearningData();
        
        // Start pattern analysis
        this.startPatternAnalysis();
        
        console.log('✅ AI Engine initialized');
    }

    async loadLearningData() {
        try {
            const stored = await chrome.storage.local.get(['aiLearningData']);
            if (stored.aiLearningData) {
                this.learningData = { ...this.learningData, ...stored.aiLearningData };
                this.patterns = new Map(stored.aiLearningData.patterns || []);
            }
        } catch (error) {
            console.error('Error loading AI learning data:', error);
        }
    }

    async saveLearningData() {
        try {
            await chrome.storage.local.set({
                aiLearningData: {
                    ...this.learningData,
                    patterns: Array.from(this.patterns.entries())
                }
            });
        } catch (error) {
            console.error('Error saving AI learning data:', error);
        }
    }

    startPatternAnalysis() {
        // Analyze patterns every 5 minutes
        setInterval(() => {
            this.analyzePatterns();
        }, 5 * 60 * 1000);
    }

    async analyzePatterns() {
        try {
            // Get recent window activity
            const stored = await chrome.storage.local.get(['windowActivity']);
            const activity = stored.windowActivity || [];
            
            if (activity.length < 5) return; // Not enough data
            
            // Analyze domain patterns
            await this.analyzeDomainPatterns(activity);
            
            // Analyze time patterns
            await this.analyzeTimePatterns(activity);
            
            // Generate suggestions
            await this.generateSuggestions();
            
        } catch (error) {
            console.error('Error analyzing patterns:', error);
        }
    }

    async analyzeDomainPatterns(activity) {
        const domainProjects = new Map();
        
        // Group activities by domain and track which projects were used
        activity.forEach(act => {
            if (!domainProjects.has(act.domain)) {
                domainProjects.set(act.domain, new Map());
            }
            
            // This would need timer data to be truly effective
            // For now, we'll use category as a proxy
            const projectCategory = act.category;
            const projectMap = domainProjects.get(act.domain);
            projectMap.set(projectCategory, (projectMap.get(projectCategory) || 0) + 1);
        });
        
        // Create patterns
        for (const [domain, projects] of domainProjects) {
            const mostUsedProject = Array.from(projects.entries())
                .sort(([,a], [,b]) => b - a)[0];
            
            if (mostUsedProject && mostUsedProject[1] >= 3) {
                const pattern = {
                    type: 'domain_project',
                    domain: domain,
                    suggestedProject: mostUsedProject[0],
                    confidence: Math.min(mostUsedProject[1] / activity.length, 1),
                    occurrences: mostUsedProject[1],
                    lastSeen: Date.now()
                };
                
                this.patterns.set(`domain_${domain}`, pattern);
            }
        }
    }

    async analyzeTimePatterns(activity) {
        const hourlyActivity = new Map();
        
        activity.forEach(act => {
            const hour = new Date(act.timestamp).getHours();
            if (!hourlyActivity.has(hour)) {
                hourlyActivity.set(hour, new Map());
            }
            
            const hourMap = hourlyActivity.get(hour);
            hourMap.set(act.category, (hourMap.get(act.category) || 0) + 1);
        });
        
        // Find peak hours for each category
        for (const [hour, categories] of hourlyActivity) {
            const topCategory = Array.from(categories.entries())
                .sort(([,a], [,b]) => b - a)[0];
            
            if (topCategory && topCategory[1] >= 2) {
                const pattern = {
                    type: 'time_category',
                    hour: hour,
                    suggestedCategory: topCategory[0],
                    confidence: topCategory[1] / activity.length,
                    occurrences: topCategory[1],
                    lastSeen: Date.now()
                };
                
                this.patterns.set(`time_${hour}`, pattern);
            }
        }
        
        await this.saveLearningData();
    }

    async generateSuggestions() {
        this.suggestions = [];
        
        // Get current context
        const currentTab = this.extension.windowTracker?.currentTab;
        if (!currentTab) return;
        
        const urlInfo = this.extension.windowTracker?.parseUrl(currentTab.url);
        if (!urlInfo) return;
        
        // Check domain patterns
        const domainPattern = this.patterns.get(`domain_${urlInfo.domain}`);
        if (domainPattern && domainPattern.confidence >= this.confidenceThreshold) {
            this.suggestions.push({
                type: 'project_suggestion',
                reason: 'domain_pattern',
                message: `You usually work on ${domainPattern.suggestedProject} when on ${urlInfo.domain}`,
                projectCategory: domainPattern.suggestedProject,
                confidence: domainPattern.confidence,
                data: domainPattern
            });
        }
        
        // Check time patterns
        const currentHour = new Date().getHours();
        const timePattern = this.patterns.get(`time_${currentHour}`);
        if (timePattern && timePattern.confidence >= this.confidenceThreshold) {
            this.suggestions.push({
                type: 'category_suggestion',
                reason: 'time_pattern',
                message: `You typically do ${timePattern.suggestedCategory} work at this time`,
                category: timePattern.suggestedCategory,
                confidence: timePattern.confidence,
                data: timePattern
            });
        }
        
        // Send suggestions to extension
        if (this.suggestions.length > 0) {
            this.extension.broadcastMessage('ai:suggestions', this.suggestions);
        }
    }

    async recordFeedback(suggestionId, accepted) {
        if (accepted) {
            this.learningData.acceptedSuggestions++;
        } else {
            this.learningData.rejectedSuggestions++;
        }
        
        // Adjust confidence based on feedback
        // This is a simplified approach - in a real AI system, you'd want more sophisticated learning
        
        await this.saveLearningData();
    }

    getInsights() {
        const totalFeedback = this.learningData.acceptedSuggestions + this.learningData.rejectedSuggestions;
        const acceptanceRate = totalFeedback > 0 ? this.learningData.acceptedSuggestions / totalFeedback : 0;
        
        return {
            patternsLearned: this.patterns.size,
            acceptanceRate: acceptanceRate,
            totalSuggestions: totalFeedback,
            insights: Array.from(this.patterns.values()).slice(0, 5) // Top 5 patterns
        };
    }

    async suggestProject(currentContext) {
        if (!currentContext) return null;
        
        const { url, title, category } = currentContext;
        const urlInfo = this.extension.windowTracker?.parseUrl(url);
        
        // Check patterns
        if (urlInfo?.domain) {
            const pattern = this.patterns.get(`domain_${urlInfo.domain}`);
            if (pattern && pattern.confidence >= this.confidenceThreshold) {
                return {
                    projectCategory: pattern.suggestedProject,
                    reason: `Based on your usage pattern for ${urlInfo.domain}`,
                    confidence: pattern.confidence
                };
            }
        }
        
        // Fallback to category-based suggestion
        const categoryProjects = {
            'development': 'Development Work',
            'design': 'Design Projects',
            'communication': 'Client Meetings',
            'productivity': 'Administrative'
        };
        
        if (categoryProjects[category]) {
            return {
                projectName: categoryProjects[category],
                reason: `Suggested based on detected activity category: ${category}`,
                confidence: 0.6
            };
        }
        
        return null;
    }
}
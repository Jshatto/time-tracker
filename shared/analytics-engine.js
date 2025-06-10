// shared/analytics-engine.js
class SharedAnalyticsEngine {
    constructor() {
        this.patterns = new Map();
        this.insights = [];
        this.metrics = {
            productivity: new Map(),
            focus: new Map(),
            patterns: new Map()
        };
        
        this.config = {
            minDataPoints: 5,
            confidenceThreshold: 0.7,
            patternDetectionWindow: 30 // days
        };
    }
    
    // Core analytics processing
    
    processTimeEntries(timeEntries) {
        const analytics = {
            total: this.calculateTotalMetrics(timeEntries),
            daily: this.calculateDailyMetrics(timeEntries),
            weekly: this.calculateWeeklyMetrics(timeEntries),
            monthly: this.calculateMonthlyMetrics(timeEntries),
            projects: this.calculateProjectMetrics(timeEntries),
            productivity: this.calculateProductivityMetrics(timeEntries)
        };
        
        return analytics;
    }
    
    calculateTotalMetrics(timeEntries) {
        const totalDuration = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
        const productiveEntries = timeEntries.filter(entry => 
            entry.metadata?.productivity > 0
        );
        const productiveDuration = productiveEntries.reduce((sum, entry) => 
            sum + (entry.duration || 0), 0
        );
        
        return {
            totalTime: totalDuration,
            productiveTime: productiveDuration,
            productivityScore: totalDuration > 0 ? (productiveDuration / totalDuration) * 100 : 0,
            entryCount: timeEntries.length,
            averageSessionTime: timeEntries.length > 0 ? totalDuration / timeEntries.length : 0,
            uniqueProjects: new Set(timeEntries.map(e => e.projectId)).size
        };
    }
    
    calculateDailyMetrics(timeEntries) {
        const dailyData = new Map();
        
        timeEntries.forEach(entry => {
            const date = new Date(entry.startTime).toISOString().split('T')[0];
            
            if (!dailyData.has(date)) {
                dailyData.set(date, {
                    date,
                    totalTime: 0,
                    productiveTime: 0,
                    entryCount: 0,
                    uniqueProjects: new Set()
                });
            }
            
            const dayData = dailyData.get(date);
            dayData.totalTime += entry.duration || 0;
            dayData.entryCount++;
            dayData.uniqueProjects.add(entry.projectId);
            
            if (entry.metadata?.productivity > 0) {
                dayData.productiveTime += entry.duration || 0;
            }
        });
        
        // Convert to array and calculate derived metrics
        const dailyArray = Array.from(dailyData.values()).map(day => ({
            ...day,
            uniqueProjects: day.uniqueProjects.size,
            productivityScore: day.totalTime > 0 ? 
                (day.productiveTime / day.totalTime) * 100 : 0,
            averageSessionTime: day.entryCount > 0 ? 
                day.totalTime / day.entryCount : 0
        }));
        
        return dailyArray.sort((a, b) => a.date.localeCompare(b.date));
    }
    
    calculateWeeklyMetrics(timeEntries) {
        const weeklyData = new Map();
        
        timeEntries.forEach(entry => {
            const date = new Date(entry.startTime);
            const weekStart = this.getWeekStart(date);
            const weekKey = weekStart.toISOString().split('T')[0];
            
            if (!weeklyData.has(weekKey)) {
                weeklyData.set(weekKey, {
                    weekStart: weekKey,
                    totalTime: 0,
                    productiveTime: 0,
                    entryCount: 0,
                    uniqueProjects: new Set(),
                    days: new Set()
                });
            }
            
            const weekData = weeklyData.get(weekKey);
            weekData.totalTime += entry.duration || 0;
            weekData.entryCount++;
            weekData.uniqueProjects.add(entry.projectId);
            weekData.days.add(date.toISOString().split('T')[0]);
            
            if (entry.metadata?.productivity > 0) {
                weekData.productiveTime += entry.duration || 0;
            }
        });
        
        return Array.from(weeklyData.values()).map(week => ({
            ...week,
            uniqueProjects: week.uniqueProjects.size,
            activeDays: week.days.size,
            productivityScore: week.totalTime > 0 ? 
                (week.productiveTime / week.totalTime) * 100 : 0,
            averageDailyTime: week.activeDays > 0 ? 
                week.totalTime / week.activeDays : 0
        }));
    }
    
    calculateMonthlyMetrics(timeEntries) {
        const monthlyData = new Map();
        
        timeEntries.forEach(entry => {
            const date = new Date(entry.startTime);
            const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
            
            if (!monthlyData.has(monthKey)) {
                monthlyData.set(monthKey, {
                    month: monthKey,
                    totalTime: 0,
                    productiveTime: 0,
                    entryCount: 0,
                    uniqueProjects: new Set(),
                    days: new Set()
                });
            }
            
            const monthData = monthlyData.get(monthKey);
            monthData.totalTime += entry.duration || 0;
            monthData.entryCount++;
            monthData.uniqueProjects.add(entry.projectId);
            monthData.days.add(date.toISOString().split('T')[0]);
            
            if (entry.metadata?.productivity > 0) {
                monthData.productiveTime += entry.duration || 0;
            }
        });
        
        return Array.from(monthlyData.values()).map(month => ({
            ...month,
            uniqueProjects: month.uniqueProjects.size,
            activeDays: month.days.size,
            productivityScore: month.totalTime > 0 ? 
                (month.productiveTime / month.totalTime) * 100 : 0,
            averageDailyTime: month.activeDays > 0 ? 
                month.totalTime / month.activeDays : 0
        }));
    }
    
    calculateProjectMetrics(timeEntries) {
        const projectData = new Map();
        
        timeEntries.forEach(entry => {
            const projectId = entry.projectId;
            
            if (!projectData.has(projectId)) {
                projectData.set(projectId, {
                    projectId,
                    totalTime: 0,
                    productiveTime: 0,
                    entryCount: 0,
                    firstEntry: entry.startTime,
                    lastEntry: entry.startTime,
                    averageProductivity: 0
                });
            }
            
            const project = projectData.get(projectId);
            project.totalTime += entry.duration || 0;
            project.entryCount++;
            
            if (new Date(entry.startTime) < new Date(project.firstEntry)) {
                project.firstEntry = entry.startTime;
            }
            
            if (new Date(entry.startTime) > new Date(project.lastEntry)) {
                project.lastEntry = entry.startTime;
            }
            
            if (entry.metadata?.productivity > 0) {
                project.productiveTime += entry.duration || 0;
            }
        });
        
        return Array.from(projectData.values()).map(project => ({
            ...project,
            productivityScore: project.totalTime > 0 ? 
                (project.productiveTime / project.totalTime) * 100 : 0,
            averageSessionTime: project.entryCount > 0 ? 
                project.totalTime / project.entryCount : 0,
            percentage: 0 // This would be calculated by the caller with total time
        }));
    }
    
    calculateProductivityMetrics(timeEntries) {
        const hourlyProductivity = new Map();
        const dailyProductivity = new Map();
        
        timeEntries.forEach(entry => {
            const date = new Date(entry.startTime);
            const hour = date.getHours();
            const dayKey = date.toISOString().split('T')[0];
            
            // Hourly productivity
            if (!hourlyProductivity.has(hour)) {
                hourlyProductivity.set(hour, {
                    hour,
                    totalTime: 0,
                    productiveTime: 0,
                    entryCount: 0
                });
            }
            
            const hourData = hourlyProductivity.get(hour);
            hourData.totalTime += entry.duration || 0;
            hourData.entryCount++;
            
            if (entry.metadata?.productivity > 0) {
                hourData.productiveTime += entry.duration || 0;
            }
            
            // Daily productivity
            if (!dailyProductivity.has(dayKey)) {
                dailyProductivity.set(dayKey, {
                    date: dayKey,
                    totalTime: 0,
                    productiveTime: 0,
                    focusTime: 0,
                    entryCount: 0
                });
            }
            
            const dayData = dailyProductivity.get(dayKey);
            dayData.totalTime += entry.duration || 0;
            dayData.entryCount++;
            
            if (entry.metadata?.productivity > 0) {
                dayData.productiveTime += entry.duration || 0;
            }
            
            if (entry.metadata?.focus > 0.7) {
                dayData.focusTime += entry.duration || 0;
            }
        });
        
        return {
            hourly: Array.from(hourlyProductivity.values()).map(hour => ({
                ...hour,
                productivityScore: hour.totalTime > 0 ? 
                    (hour.productiveTime / hour.totalTime) * 100 : 0
            })),
            daily: Array.from(dailyProductivity.values()).map(day => ({
                ...day,
                productivityScore: day.totalTime > 0 ? 
                    (day.productiveTime / day.totalTime) * 100 : 0,
                focusScore: day.totalTime > 0 ? 
                    (day.focusTime / day.totalTime) * 100 : 0
            }))
        };
    }
    
    // Pattern detection
    
    detectTimePatterns(timeEntries) {
        const patterns = [];
        
        // Peak productivity hours
        const hourlyData = this.calculateHourlyActivity(timeEntries);
        const peakHour = this.findPeakProductivityHour(hourlyData);
        
        if (peakHour) {
            patterns.push({
                type: 'peak_productivity_hour',
                description: `Most productive between ${peakHour.start}:00 and ${peakHour.end}:00`,
                confidence: peakHour.confidence,
                data: peakHour
            });
        }
        
        // Preferred project patterns
        const projectPreference = this.detectProjectPreferences(timeEntries);
        if (projectPreference) {
            patterns.push(projectPreference);
        }
        
        // Work schedule patterns
        const schedulePattern = this.detectWorkSchedule(timeEntries);
        if (schedulePattern) {
            patterns.push(schedulePattern);
        }
        
        // Focus patterns
        const focusPattern = this.detectFocusPatterns(timeEntries);
        if (focusPattern) {
            patterns.push(focusPattern);
        }
        
        return patterns;
    }
    
    calculateHourlyActivity(timeEntries) {
        const hourlyData = new Map();
        
        timeEntries.forEach(entry => {
            const hour = new Date(entry.startTime).getHours();
            
            if (!hourlyData.has(hour)) {
                hourlyData.set(hour, {
                    hour,
                    totalTime: 0,
                    productiveTime: 0,
                    entryCount: 0,
                    productivity: 0
                });
            }
            
            const data = hourlyData.get(hour);
            data.totalTime += entry.duration || 0;
            data.entryCount++;
            
            if (entry.metadata?.productivity > 0) {
                data.productiveTime += entry.duration || 0;
            }
        });
        
        // Calculate productivity scores
        hourlyData.forEach(data => {
            data.productivity = data.totalTime > 0 ? 
                data.productiveTime / data.totalTime : 0;
        });
        
        return hourlyData;
    }
    
    findPeakProductivityHour(hourlyData) {
        const hours = Array.from(hourlyData.values())
            .filter(hour => hour.entryCount >= this.config.minDataPoints)
            .sort((a, b) => b.productivity - a.productivity);
        
        if (hours.length === 0) return null;
        
        const peakHour = hours[0];
        const confidence = Math.min(peakHour.entryCount / 20, 1); // Max confidence at 20+ entries
        
        if (confidence < this.config.confidenceThreshold) return null;
        
        return {
            start: peakHour.hour,
            end: (peakHour.hour + 1) % 24,
            productivity: peakHour.productivity,
            confidence,
            entryCount: peakHour.entryCount
        };
    }
    
    detectProjectPreferences(timeEntries) {
        const projectTime = new Map();
        
        timeEntries.forEach(entry => {
            const projectId = entry.projectId;
            projectTime.set(projectId, (projectTime.get(projectId) || 0) + (entry.duration || 0));
        });
        
        const totalTime = Array.from(projectTime.values()).reduce((sum, time) => sum + time, 0);
        const sortedProjects = Array.from(projectTime.entries())
            .sort(([,a], [,b]) => b - a);
        
        if (sortedProjects.length === 0) return null;
        
        const topProject = sortedProjects[0];
        const percentage = (topProject[1] / totalTime) * 100;
        
        if (percentage > 40) { // Significant preference
            return {
                type: 'project_preference',
                description: `You spend ${Math.round(percentage)}% of your time on your primary project`,
                confidence: Math.min(percentage / 50, 1),
                data: {
                    projectId: topProject[0],
                    percentage,
                    totalTime: topProject[1]
                }
            };
        }
        
        return null;
    }
    
    detectWorkSchedule(timeEntries) {
        const dayOfWeekActivity = new Map();
        
        timeEntries.forEach(entry => {
            const dayOfWeek = new Date(entry.startTime).getDay();
            
            if (!dayOfWeekActivity.has(dayOfWeek)) {
                dayOfWeekActivity.set(dayOfWeek, {
                    day: dayOfWeek,
                    totalTime: 0,
                    entryCount: 0
                });
            }
            
            const data = dayOfWeekActivity.get(dayOfWeek);
            data.totalTime += entry.duration || 0;
            data.entryCount++;
        });
        
        const weekdays = [1, 2, 3, 4, 5]; // Mon-Fri
        const weekdayTime = weekdays.reduce((sum, day) => 
            sum + (dayOfWeekActivity.get(day)?.totalTime || 0), 0
        );
        
        const weekendTime = [0, 6].reduce((sum, day) => 
            sum + (dayOfWeekActivity.get(day)?.totalTime || 0), 0
        );
        
        const totalTime = weekdayTime + weekendTime;
        
        if (totalTime === 0) return null;
        
        const weekdayPercentage = (weekdayTime / totalTime) * 100;
        
        if (weekdayPercentage > 80) {
            return {
                type: 'work_schedule',
                description: 'You primarily work on weekdays',
                confidence: Math.min(weekdayPercentage / 90, 1),
                data: {
                    pattern: 'weekdays',
                    weekdayPercentage
                }
            };
        } else if (weekdayPercentage < 60) {
            return {
                type: 'work_schedule',
                description: 'You have a flexible work schedule including weekends',
                confidence: Math.min((100 - weekdayPercentage) / 40, 1),
                data: {
                    pattern: 'flexible',
                    weekdayPercentage
                }
            };
        }
        
        return null;
    }
    
    detectFocusPatterns(timeEntries) {
        const focusEntries = timeEntries.filter(entry => 
            entry.metadata?.focus !== undefined
        );
        
        if (focusEntries.length < this.config.minDataPoints) return null;
        
        const averageFocus = focusEntries.reduce((sum, entry) => 
            sum + entry.metadata.focus, 0
        ) / focusEntries.length;
        
        const focusVariance = focusEntries.reduce((sum, entry) => 
            sum + Math.pow(entry.metadata.focus - averageFocus, 2), 0
        ) / focusEntries.length;
        
        if (averageFocus > 0.7) {
            return {
                type: 'high_focus',
                description: 'You maintain high focus levels consistently',
                confidence: Math.min(averageFocus, 1),
                data: {
                    averageFocus,
                    variance: focusVariance
                }
            };
        } else if (focusVariance > 0.3) {
            return {
                type: 'variable_focus',
                description: 'Your focus levels vary significantly throughout the day',
                confidence: Math.min(focusVariance, 1),
                data: {
                    averageFocus,
                    variance: focusVariance
                }
            };
        }
        
        return null;
    }
    
    // Insight generation
    
    generateInsights(analytics, patterns) {
        const insights = [];
        
        // Productivity insights
        if (analytics.total.productivityScore > 0) {
            insights.push(...this.generateProductivityInsights(analytics));
        }
        
        // Pattern-based insights
        patterns.forEach(pattern => {
            const insight = this.patternToInsight(pattern);
            if (insight) insights.push(insight);
        });
        
        // Trend insights
        if (analytics.daily.length > 7) {
            insights.push(...this.generateTrendInsights(analytics.daily));
        }
        
        return insights.sort((a, b) => b.priority - a.priority);
    }
    
    generateProductivityInsights(analytics) {
        const insights = [];
        const { productivityScore } = analytics.total;
        
        if (productivityScore > 80) {
            insights.push({
                type: 'productivity',
                level: 'positive',
                title: 'Excellent Productivity',
                description: `Your productivity score of ${Math.round(productivityScore)}% is excellent! Keep up the great work.`,
                priority: 8,
                actionable: false
            });
        } else if (productivityScore < 40) {
            insights.push({
                type: 'productivity',
                level: 'improvement',
                title: 'Productivity Opportunity',
                description: `Your productivity score is ${Math.round(productivityScore)}%. Consider identifying and reducing distractions.`,
                priority: 9,
                actionable: true,
                suggestions: [
                    'Review your most distracting activities',
                    'Set specific focus times',
                    'Use productivity techniques like Pomodoro'
                ]
            });
        }
        
        return insights;
    }
    
    patternToInsight(pattern) {
        switch (pattern.type) {
            case 'peak_productivity_hour':
                return {
                    type: 'scheduling',
                    level: 'positive',
                    title: 'Peak Performance Time Identified',
                    description: pattern.description,
                    priority: 7,
                    actionable: true,
                    suggestions: [
                        'Schedule your most important tasks during this time',
                        'Protect this time from meetings and interruptions'
                    ]
                };
                
            case 'project_preference':
                return {
                    type: 'focus',
                    level: 'neutral',
                    title: 'Strong Project Focus',
                    description: pattern.description,
                    priority: 5,
                    actionable: false
                };
                
            case 'work_schedule':
                return {
                    type: 'schedule',
                    level: 'neutral',
                    title: 'Work Pattern Detected',
                    description: pattern.description,
                    priority: 4,
                    actionable: false
                };
                
            default:
                return null;
        }
    }
    
    generateTrendInsights(dailyData) {
        const insights = [];
        
        // Check for recent productivity trend
        const recentDays = dailyData.slice(-7);
        const earlierDays = dailyData.slice(-14, -7);
        
        if (recentDays.length >= 5 && earlierDays.length >= 5) {
            const recentAvg = recentDays.reduce((sum, day) => 
                sum + day.productivityScore, 0
            ) / recentDays.length;
            
            const earlierAvg = earlierDays.reduce((sum, day) => 
                sum + day.productivityScore, 0
            ) / earlierDays.length;
            
            const change = recentAvg - earlierAvg;
            
            if (change > 10) {
                insights.push({
                    type: 'trend',
                    level: 'positive',
                    title: 'Productivity Improving',
                    description: `Your productivity has increased by ${Math.round(change)}% this week!`,
                    priority: 8,
                    actionable: false
                });
            } else if (change < -10) {
                insights.push({
                    type: 'trend',
                    level: 'warning',
                    title: 'Productivity Declining',
                    description: `Your productivity has decreased by ${Math.round(Math.abs(change))}% this week.`,
                    priority: 9,
                    actionable: true,
                    suggestions: [
                        'Review what changed in your routine',
                        'Check for new distractions or stressors',
                        'Consider taking a break or adjusting your schedule'
                    ]
                });
            }
        }
        
        return insights;
    }
    
    // Utility methods
    
    getWeekStart(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
        return new Date(d.setDate(diff));
    }
    
    formatDuration(milliseconds) {
        const hours = Math.floor(milliseconds / (1000 * 60 * 60));
        const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60));
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
}

// Export for different environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SharedAnalyticsEngine;
} else {
    window.SharedAnalyticsEngine = SharedAnalyticsEngine;
}
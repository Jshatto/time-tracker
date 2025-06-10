// utils/analytics.js - Analytics processing engine
class AnalyticsEngine {
  constructor() {
    this.patterns = new Map();
    this.insights = [];
  }

  async generateDailyReport() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Aggregate daily stats (simplified)
      const TimeEntry = require('../models/TimeEntry');
      const dailyEntries = await TimeEntry.find({
        startTime: { $gte: today, $lt: tomorrow }
      }).populate('projectId', 'name color');

      const report = {
        date: today,
        totalTime: dailyEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0),
        entryCount: dailyEntries.length,
        projectBreakdown: this.calculateProjectBreakdown(dailyEntries),
        productivity: this.calculateProductivityScore(dailyEntries)
      };

      console.log('📊 Daily report generated:', report);
      return report;
    } catch (error) {
      console.error('Error generating daily report:', error);
      throw error;
    }
  }

  calculateProjectBreakdown(entries) {
    const breakdown = {};
    entries.forEach(entry => {
      const projectName = entry.projectId?.name || 'Unknown';
      breakdown[projectName] = (breakdown[projectName] || 0) + (entry.duration || 0);
    });
    return breakdown;
  }

  calculateProductivityScore(entries) {
    // Simplified productivity calculation
    const totalTime = entries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const productiveTime = entries
      .filter(entry => entry.metadata?.productivity > 0)
      .reduce((sum, entry) => sum + (entry.duration || 0), 0);
    
    return totalTime > 0 ? (productiveTime / totalTime) * 100 : 0;
  }

  async detectPatterns(userId) {
    // Simplified pattern detection
    const TimeEntry = require('../models/TimeEntry');
    const recentEntries = await TimeEntry.find({
      userId: userId,
      startTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    });

    const patterns = [];
    
    // Detect common work hours
    const hourCounts = {};
    recentEntries.forEach(entry => {
      const hour = new Date(entry.startTime).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });

    const peakHour = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)[0];

    if (peakHour) {
      patterns.push({
        type: 'peak_hours',
        description: `You're most productive at ${peakHour[0]}:00`,
        confidence: Math.min(peakHour[1] / recentEntries.length, 1)
      });
    }

    return patterns;
  }
}

module.exports = AnalyticsEngine;
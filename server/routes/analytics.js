// server/routes/analytics.js
const express = require('express');
const router = express.Router();
const TimeEntry = require('../models/TimeEntry');
const Project = require('../models/Project');
const WindowEvent = require('../models/WindowEvent');
const AnalyticsEngine = require('../utils/analytics');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware
router.use(authMiddleware);

const analytics = new AnalyticsEngine();

// GET /api/analytics/dashboard - Main dashboard data
router.get('/dashboard', async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const userId = req.user.id;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (period) {
      case '1d':
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }
    
    // Get time entries for period
    const timeEntries = await TimeEntry.find({
      userId: userId,
      startTime: { $gte: startDate, $lte: now }
    }).populate('projectId', 'name color');
    
    // Calculate basic stats
    const totalTime = timeEntries.reduce((sum, entry) => sum + (entry.duration || 0), 0);
    const totalEntries = timeEntries.length;
    const uniqueProjects = new Set(timeEntries.map(e => e.projectId?._id?.toString())).size;
    
    // Project breakdown
    const projectStats = {};
    timeEntries.forEach(entry => {
      const projectId = entry.projectId?._id?.toString();
      const projectName = entry.projectId?.name || 'Unknown';
      const projectColor = entry.projectId?.color || '#667eea';
      
      if (!projectStats[projectId]) {
        projectStats[projectId] = {
          name: projectName,
          color: projectColor,
          totalTime: 0,
          entryCount: 0
        };
      }
      
      projectStats[projectId].totalTime += entry.duration || 0;
      projectStats[projectId].entryCount += 1;
    });
    
    // Daily breakdown
    const dailyStats = {};
    timeEntries.forEach(entry => {
      const day = entry.startTime.toISOString().split('T')[0];
      if (!dailyStats[day]) {
        dailyStats[day] = { date: day, totalTime: 0, entryCount: 0 };
      }
      dailyStats[day].totalTime += entry.duration || 0;
      dailyStats[day].entryCount += 1;
    });
    
    // Productivity insights
    const productivityScore = await analytics.calculateProductivityScore(timeEntries);
    const focusScore = await analytics.calculateFocusScore(timeEntries);
    
    res.json({
      summary: {
        totalTime,
        totalEntries,
        uniqueProjects,
        averageSessionTime: totalEntries > 0 ? totalTime / totalEntries : 0,
        productivityScore,
        focusScore
      },
      projectBreakdown: Object.values(projectStats),
      dailyBreakdown: Object.values(dailyStats).sort((a, b) => a.date.localeCompare(b.date)),
      period,
      generatedAt: new Date()
    });
    
  } catch (error) {
    console.error('Error generating dashboard analytics:', error);
    res.status(500).json({ error: 'Failed to generate analytics' });
  }
});

// GET /api/analytics/productivity - Detailed productivity analysis
router.get('/productivity', async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const userId = req.user.id;
    
    const insights = await analytics.generateProductivityInsights(userId, period);
    res.json(insights);
  } catch (error) {
    console.error('Error generating productivity analytics:', error);
    res.status(500).json({ error: 'Failed to generate productivity analytics' });
  }
});

// GET /api/analytics/patterns - Pattern analysis
router.get('/patterns', async (req, res) => {
  try {
    const userId = req.user.id;
    const patterns = await analytics.detectPatterns(userId);
    res.json(patterns);
  } catch (error) {
    console.error('Error detecting patterns:', error);
    res.status(500).json({ error: 'Failed to detect patterns' });
  }
});

// POST /api/analytics/window-events - Store window tracking events
router.post('/window-events', async (req, res) => {
  try {
    const { events } = req.body;
    
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Events must be an array' });
    }
    
    // Process and store events
    const processedEvents = events.map(event => ({
      ...event,
      userId: req.user.id,
      receivedAt: new Date()
    }));
    
    // Batch insert for performance
    if (processedEvents.length > 0) {
      await WindowEvent.insertMany(processedEvents);
    }
    
    res.json({ 
      message: 'Events stored successfully',
      count: processedEvents.length 
    });
  } catch (error) {
    console.error('Error storing window events:', error);
    res.status(500).json({ error: 'Failed to store window events' });
  }
});

// GET /api/analytics/export - Export analytics data
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', startDate, endDate } = req.query;
    const userId = req.user.id;
    
    // Build date range
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    
    const query = { userId };
    if (Object.keys(dateFilter).length > 0) {
      query.startTime = dateFilter;
    }
    
    // Get data
    const timeEntries = await TimeEntry.find(query)
      .populate('projectId', 'name color')
      .sort({ startTime: -1 });
    
    const projects = await Project.find({ userId, isActive: true });
    
    const exportData = {
      timeEntries: timeEntries.map(entry => ({
        id: entry._id,
        project: entry.projectId?.name || 'Unknown',
        description: entry.description,
        startTime: entry.startTime,
        endTime: entry.endTime,
        duration: entry.duration,
        status: entry.status
      })),
      projects: projects.map(project => ({
        id: project._id,
        name: project.name,
        description: project.description,
        color: project.color,
        hourlyRate: project.hourlyRate
      })),
      exportedAt: new Date(),
      totalEntries: timeEntries.length
    };
    
    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(exportData.timeEntries);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="time-tracking-export.csv"');
      res.send(csv);
    } else {
      res.json(exportData);
    }
    
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// Helper function to convert to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') 
          ? `"${value}"` 
          : value;
      }).join(',')
    )
  ].join('\n');
  
  return csvContent;
}

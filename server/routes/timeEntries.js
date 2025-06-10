// server/routes/timeEntries.js
const express = require('express');
const router = express.Router();
const TimeEntry = require('../models/TimeEntry');
const Project = require('../models/Project');
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// GET /api/time-entries - Get all time entries for user
router.get('/', async (req, res) => {
  try {
    const { startDate, endDate, projectId, status, limit = 50, offset = 0 } = req.query;
    
    // Build query
    const query = { userId: req.user.id };
    
    if (startDate && endDate) {
      query.startTime = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }
    
    if (projectId) {
      query.projectId = projectId;
    }
    
    if (status) {
      query.status = status;
    }
    
    // Execute query with pagination
    const timeEntries = await TimeEntry.find(query)
      .populate('projectId', 'name color')
      .sort({ startTime: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));
    
    const total = await TimeEntry.countDocuments(query);
    
    res.json({
      timeEntries,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: total > (parseInt(offset) + parseInt(limit))
      }
    });
    
  } catch (error) {
    console.error('Error fetching time entries:', error);
    res.status(500).json({ error: 'Failed to fetch time entries' });
  }
});

// GET /api/time-entries/:id - Get specific time entry
router.get('/:id', async (req, res) => {
  try {
    const timeEntry = await TimeEntry.findOne({
      _id: req.params.id,
      userId: req.user.id
    }).populate('projectId', 'name color');
    
    if (!timeEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }
    
    res.json(timeEntry);
  } catch (error) {
    console.error('Error fetching time entry:', error);
    res.status(500).json({ error: 'Failed to fetch time entry' });
  }
});

// POST /api/time-entries - Create new time entry
router.post('/', [
  body('projectId').isMongoId().withMessage('Valid project ID is required'),
  body('startTime').isISO8601().withMessage('Valid start time is required'),
  body('description').optional().isLength({ max: 500 }).withMessage('Description too long')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    // Verify project exists and belongs to user
    const project = await Project.findOne({
      _id: req.body.projectId,
      userId: req.user.id
    });
    
    if (!project) {
      return res.status(400).json({ error: 'Project not found or access denied' });
    }

    // Stop any running timers for this user
    await TimeEntry.updateMany(
      { userId: req.user.id, status: 'running' },
      { 
        status: 'stopped',
        endTime: new Date(),
        $unset: { isRunning: 1 }
      }
    );

    // Create new time entry
    const timeEntry = new TimeEntry({
      ...req.body,
      userId: req.user.id,
      status: req.body.status || 'running',
      isRunning: req.body.status !== 'completed'
    });

    await timeEntry.save();
    await timeEntry.populate('projectId', 'name color');

    // Update project last used
    project.lastUsed = new Date();
    await project.save();

    res.status(201).json(timeEntry);
  } catch (error) {
    console.error('Error creating time entry:', error);
    res.status(500).json({ error: 'Failed to create time entry' });
  }
});

// PUT /api/time-entries/:id - Update time entry
router.put('/:id', [
  body('description').optional().isLength({ max: 500 }),
  body('startTime').optional().isISO8601(),
  body('endTime').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: errors.array() 
      });
    }

    // Calculate duration if both start and end times are provided
    const updateData = { ...req.body };
    if (updateData.startTime && updateData.endTime) {
      updateData.duration = new Date(updateData.endTime) - new Date(updateData.startTime);
    }

    const timeEntry = await TimeEntry.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      updateData,
      { new: true, runValidators: true }
    ).populate('projectId', 'name color');

    if (!timeEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    res.json(timeEntry);
  } catch (error) {
    console.error('Error updating time entry:', error);
    res.status(500).json({ error: 'Failed to update time entry' });
  }
});

// DELETE /api/time-entries/:id - Delete time entry
router.delete('/:id', async (req, res) => {
  try {
    const timeEntry = await TimeEntry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!timeEntry) {
      return res.status(404).json({ error: 'Time entry not found' });
    }

    res.json({ message: 'Time entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting time entry:', error);
    res.status(500).json({ error: 'Failed to delete time entry' });
  }
});

// POST /api/time-entries/:id/stop - Stop running timer
router.post('/:id/stop', async (req, res) => {
  try {
    const endTime = new Date();
    
    const timeEntry = await TimeEntry.findOneAndUpdate(
      { 
        _id: req.params.id, 
        userId: req.user.id,
        status: 'running'
      },
      { 
        status: 'completed',
        endTime: endTime,
        $unset: { isRunning: 1 }
      },
      { new: true }
    ).populate('projectId', 'name color');

    if (!timeEntry) {
      return res.status(404).json({ error: 'Running time entry not found' });
    }

    // Calculate duration
    timeEntry.duration = endTime - new Date(timeEntry.startTime);
    await timeEntry.save();

    res.json(timeEntry);
  } catch (error) {
    console.error('Error stopping time entry:', error);
    res.status(500).json({ error: 'Failed to stop time entry' });
  }
});

// GET /api/time-entries/running - Get currently running timer
router.get('/status/running', async (req, res) => {
  try {
    const runningEntry = await TimeEntry.findOne({
      userId: req.user.id,
      status: 'running'
    }).populate('projectId', 'name color');

    res.json(runningEntry);
  } catch (error) {
    console.error('Error fetching running timer:', error);
    res.status(500).json({ error: 'Failed to fetch running timer' });
  }
});

module.exports = router;

// routes/sync.js - Cross-platform sync endpoints
const express = require('express');
const router = express.Router();
const SyncStatus = require('../models/SyncStatus');
const TimeEntry = require('../models/TimeEntry');
const Project = require('../models/Project');

// Get sync status
router.get('/status', async (req, res) => {
  try {
    const deviceId = req.syncMeta.deviceId;
    
    let syncStatus = await SyncStatus.findOne({
      userId: req.user.id,
      deviceId: deviceId
    });

    if (!syncStatus) {
      syncStatus = new SyncStatus({
        userId: req.user.id,
        deviceId: deviceId,
        lastSync: new Date(),
        syncVersion: 1
      });
      await syncStatus.save();
    }

    res.json(res.setSyncHeaders(syncStatus));
  } catch (error) {
    console.error('Error getting sync status:', error);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Sync data
router.post('/sync', async (req, res) => {
  try {
    const { lastSync, data } = req.body;
    const deviceId = req.syncMeta.deviceId;
    
    // Get changes since last sync
    const sinceDate = lastSync ? new Date(lastSync) : new Date(0);
    
    const serverChanges = {
      timeEntries: await TimeEntry.find({
        userId: req.user.id,
        updatedAt: { $gt: sinceDate }
      }).populate('projectId', 'name color'),
      
      projects: await Project.find({
        userId: req.user.id,
        updatedAt: { $gt: sinceDate }
      })
    };

    // Apply client changes (simplified - real implementation would handle conflicts)
    if (data.timeEntries) {
      for (const entry of data.timeEntries) {
        if (entry._id && entry._id.startsWith('local_')) {
          // New local entry
          delete entry._id;
          const newEntry = new TimeEntry({ ...entry, userId: req.user.id });
          await newEntry.save();
        } else if (entry._id) {
          // Update existing entry
          await TimeEntry.findOneAndUpdate(
            { _id: entry._id, userId: req.user.id },
            entry,
            { upsert: true }
          );
        }
      }
    }

    // Update sync status
    await SyncStatus.findOneAndUpdate(
      { userId: req.user.id, deviceId: deviceId },
      { 
        lastSync: new Date(),
        $inc: { 'statistics.totalSyncs': 1, 'statistics.successfulSyncs': 1 }
      },
      { upsert: true }
    );

    res.json(res.setSyncHeaders({
      serverChanges,
      timestamp: Date.now(),
      conflicts: [] // Simplified - real implementation would detect conflicts
    }));

  } catch (error) {
    console.error('Error during sync:', error);
    res.status(500).json({ error: 'Sync failed' });
  }
});

module.exports = router;
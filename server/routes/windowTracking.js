// routes/windowTracking.js - Window tracking rules management
const express = require('express');
const router = express.Router();
const WindowTrackingRule = require('../models/WindowTrackingRule');
const { body, validationResult } = require('express-validator');

// Get all rules for user
router.get('/', async (req, res) => {
  try {
    const rules = await WindowTrackingRule.find({ 
      userId: req.user.id 
    }).sort({ priority: -1, createdAt: -1 });
    
    res.json(rules);
  } catch (error) {
    console.error('Error fetching rules:', error);
    res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

// Create new rule
router.post('/', [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('conditions').isObject(),
  body('actionConfig').isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: errors.array() });
    }

    const rule = new WindowTrackingRule({
      ...req.body,
      userId: req.user.id
    });

    await rule.save();
    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating rule:', error);
    res.status(500).json({ error: 'Failed to create rule' });
  }
});

// Update rule
router.put('/:id', async (req, res) => {
  try {
    const rule = await WindowTrackingRule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json(rule);
  } catch (error) {
    console.error('Error updating rule:', error);
    res.status(500).json({ error: 'Failed to update rule' });
  }
});

// Delete rule
router.delete('/:id', async (req, res) => {
  try {
    const rule = await WindowTrackingRule.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id
    });

    if (!rule) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    res.json({ message: 'Rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting rule:', error);
    res.status(500).json({ error: 'Failed to delete rule' });
  }
});

module.exports = router;
// server/routes/projects.js
const express = require('express');
const router = express.Router();
const Project = require('../models/Project');
const TimeEntry = require('../models/TimeEntry');
const authMiddleware = require('../middleware/auth');
const { body, validationResult } = require('express-validator');

// Apply authentication to all project routes
router.use(authMiddleware);

// GET /api/projects?active={true|all} - List user's projects
router.get('/', async (req, res) => {
  try {
    const { active = 'true' } = req.query;
    const query = { userId: req.user.id };
    if (active !== 'all') query.isActive = active === 'true';

    const projects = await Project.find(query).sort({ name: 1 });
    // Attach stats
    const projectsWithStats = await Promise.all(
      projects.map(async project => {
        const stats = await TimeEntry.aggregate([
          { $match: { projectId: project._id, userId: req.user.id, endTime: { $exists: true } } },
          { $group: { _id: null, totalDuration: { $sum: '$duration' }, entryCount: { $sum: 1 } } }
        ]);
        return {
          ...project.toObject(),
          stats: {
            totalTime: stats[0]?.totalDuration || 0,
            entryCount: stats[0]?.entryCount || 0
          }
        };
      })
    );
    res.json(projectsWithStats);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// POST /api/projects - Create a new project
router.post('/', [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name required'),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Invalid color'),
  body('hourlyRate').optional().isFloat({ min: 0 }).withMessage('Hourly rate must be non-negative')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  try {
    // Prevent duplicate names
    const exists = await Project.findOne({ userId: req.user.id, name: req.body.name });
    if (exists) return res.status(400).json({ error: 'Project name already exists' });

    const project = new Project({ ...req.body, userId: req.user.id });
    await project.save();
    res.status(201).json(project);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// PUT /api/projects/:id - Update project
router.put('/:id', [
  body('name').optional().trim().isLength({ min: 1, max: 100 }),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i),
  body('isActive').optional().isBoolean()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  try {
    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// DELETE /api/projects/:id - Delete project if no entries
router.delete('/:id', async (req, res) => {
  try {
    const count = await TimeEntry.countDocuments({ projectId: req.params.id, userId: req.user.id });
    if (count > 0) {
      return res.status(400).json({ error: 'Cannot delete project with time entries; set isActive=false to archive' });
    }
    const project = await Project.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Auth routes for your time tracker app

router.post('/login', (req, res) => {
    try {
        // Demo login - create a token for demo user
        const user = {
            id: 'demo-user-' + Date.now(),
            email: 'demo@financialcents.com',
            name: 'Demo User'
        };

        // Create JWT token (if JWT_SECRET exists)
        let token = null;
        if (process.env.JWT_SECRET) {
            token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '24h' });
        }

        res.json({ 
            success: true, 
            message: 'Login successful',
            user: user,
            token: token
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Login failed',
            error: error.message 
        });
    }
});

router.get('/profile', (req, res) => {
    try {
        // Return demo user profile
        const user = {
            id: 'demo-user',
            email: 'demo@financialcents.com',
            name: 'Demo User'
        };
        
        res.json({ 
            success: true,
            user: user
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Profile fetch failed',
            error: error.message 
        });
    }
});

router.post('/logout', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Logout successful' 
    });
});

module.exports = router;
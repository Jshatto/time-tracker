const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Demo auth routes for time tracker

router.post('/login', (req, res) => {
    try {
        const user = {
            id: 'demo-user-' + Date.now(),
            email: 'demo@financialcents.com',
            name: 'Demo User'
        };

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
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Login failed',
            error: error.message 
        });
    }
});

router.get('/profile', (req, res) => {
    try {
        const user = req.user || {
            id: 'demo-user',
            email: 'demo@financialcents.com',
            name: 'Demo User'
        };
        
        res.json({ 
            success: true,
            user: user
        });
    } catch (error) {
        console.error('Profile error:', error);
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

router.get('/status', (req, res) => {
    res.json({ 
        success: true, 
        message: 'Auth service is running' 
    });
});

module.exports = router;

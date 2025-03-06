require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { dripFaucet, supportedChains } = require('./api/faucet');

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// Get supported chains
app.get('/api/faucet/chains', (req, res) => {
    res.json({
        success: true,
        chains: supportedChains
    });
});

// Access code verification endpoint
app.post('/api/faucet/access-code', async (req, res) => {
    try {
        const { address, chain, accessCode } = req.body;
        
        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }

        if (!chain) {
            return res.status(400).json({
                success: false,
                error: 'Chain is required',
                supportedChains
            });
        }

        if (!accessCode) {
            return res.status(400).json({
                success: false,
                error: 'Access code is required'
            });
        }

        // Verify access code
        if (accessCode !== process.env.ADMIN_SECRET_KEY) {
            return res.status(401).json({
                success: false,
                error: 'Invalid access code'
            });
        }

        const result = await dripFaucet(address, chain);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Regular faucet endpoint
app.post('/api/faucet', async (req, res) => {
    try {
        const { address, chain } = req.body;
        
        if (!address) {
            return res.status(400).json({
                success: false,
                error: 'Address is required'
            });
        }

        if (!chain) {
            return res.status(400).json({
                success: false,
                error: 'Chain is required',
                supportedChains
            });
        }

        const result = await dripFaucet(address, chain);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: "Something went wrong!",
        details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
});

// Start the server
app.listen(PORT, () => {
    console.log(`Faucet API running on port ${PORT}`);
});

module.exports = app; // For testing 
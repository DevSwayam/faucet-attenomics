require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { dripFaucet, supportedChains } = require('./faucet');

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Faucet API running on port ${PORT}`);
}); 
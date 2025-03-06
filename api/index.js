require('dotenv').config();
const express = require('express');
const { dripFaucet, supportedChains } = require('./faucet');

const app = express();
app.use(express.json());

// Rate limiting middleware - modified for testing
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // 5 requests per minute
    message: {
        success: false,
        error: 'Too many requests, please try again later.'
    }
});

// Get supported chains
app.get('/api/faucet/chains', (req, res) => {
    res.json({
        success: true,
        chains: supportedChains
    });
});

app.post('/api/faucet', limiter, async (req, res) => {
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
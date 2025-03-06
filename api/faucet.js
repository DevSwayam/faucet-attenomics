require('dotenv').config();
const { ethers } = require('ethers');
const chainConfig = require('../config/chain');

// Validate private key
if (!process.env.PRIVATE_KEY) {
    throw new Error('PRIVATE_KEY environment variable is required');
}

// Format private key (remove 0x prefix if present)
const privateKey = process.env.PRIVATE_KEY.replace('0x', '');

// Initialize providers and wallets for each chain
const providers = {};
const wallets = {};

// Initialize providers and wallets for each configured chain
Object.keys(chainConfig).forEach(chain => {
    providers[chain] = new ethers.JsonRpcProvider(chainConfig[chain].rpcUrl);
    wallets[chain] = new ethers.Wallet(privateKey, providers[chain]);
});

async function dripFaucet(address, chain) {
    try {
        // Validate chain
        if (!chainConfig[chain]) {
            throw new Error(`Unsupported chain: ${chain}`);
        }

        // Validate address
        if (!ethers.isAddress(address)) {
            throw new Error('Invalid Ethereum address');
        }

        // Check balance of the requesting address
        const balance = await providers[chain].getBalance(address);
        
        // If balance is less than minimum required
        if (balance < chainConfig[chain].minBalance) {
            // Prepare transaction
            const tx = {
                to: address,
                value: chainConfig[chain].faucetAmount
            };

            // Send transaction
            const transaction = await wallets[chain].sendTransaction(tx);
            
            // Wait for transaction to be mined
            const receipt = await transaction.wait();
            
            return {
                success: true,
                chain,
                txHash: receipt.hash,
                amount: ethers.formatEther(chainConfig[chain].faucetAmount),
                explorerUrl: `${chainConfig[chain].explorerUrl}/tx/${receipt.hash}`
            };
        } else {
            return {
                success: false,
                chain,
                message: 'Address already has sufficient balance',
                currentBalance: ethers.formatEther(balance)
            };
        }
    } catch (error) {
        return {
            success: false,
            chain,
            error: error.message
        };
    }
}

module.exports = {
    dripFaucet,
    supportedChains: Object.keys(chainConfig)
}; 
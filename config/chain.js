const { ethers } = require('ethers');

const chainConfig = {
    // Sepolia testnet configuration
    sepolia: {
        chainId: 11155111,
        rpcUrl: process.env.SEPOLIA_RPC_URL,
        name: 'Sepolia',
        symbol: 'ETH',
        explorerUrl: 'https://sepolia.etherscan.io',
        faucetAmount: ethers.parseEther('0.1'),
        minBalance: ethers.parseEther('0.05')
    },
    // Mumbai testnet configuration
    mumbai: {
        chainId: 80001,
        rpcUrl: process.env.MUMBAI_RPC_URL,
        name: 'Mumbai',
        symbol: 'MATIC',
        explorerUrl: 'https://mumbai.polygonscan.com',
        faucetAmount: ethers.parseEther('0.1'),
        minBalance: ethers.parseEther('0.05')
    },
    sonicBlaze: {
        chainId: 57054,
        rpcUrl: process.env.SONIC_BLAZE_RPC_URL,
        name: 'Sonic Blaze Testnet',
        symbol: 'S',
        explorerUrl: 'https://testnet.sonicscan.org',
        faucetAmount: ethers.parseEther('0.1'),
        minBalance: ethers.parseEther('0.05')
    },
    mantleSepolia: {
        chainId: 5003,
        rpcUrl: 'https://rpc.sepolia.mantle.xyz',
        name: 'Mantle Sepolia Testnet',
        symbol: 'MNT',
        explorerUrl: 'https://sepolia.mantlescan.xyz',
        faucetAmount: ethers.parseEther('0.1'),
        minBalance: ethers.parseEther('0.05')
    }
};

module.exports = chainConfig; 
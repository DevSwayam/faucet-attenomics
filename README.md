# Faucet Dripper API

A multi-chain faucet API that allows users to request test tokens from supported networks. The API supports both regular faucet requests and access code-based requests for controlled distribution.

## Supported Networks

- Sonic Blaze Testnet (Chain ID: 57054)
- Mantle Sepolia Testnet (Chain ID: 5003)

## Features

- Multi-chain support
- Access code verification system
- Rate limiting (5 requests per minute)
- CORS enabled for cross-origin requests
- Error handling and validation
- Balance checking before distribution

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Private key for the faucet wallet
- RPC URLs for supported networks

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd faucet-dripper-api
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
PORT=3001
ADMIN_SECRET_KEY=your_admin_secret_key_here
SONIC_BLAZE_RPC_URL=https://rpc.blaze.soniclabs.com
PRIVATE_KEY=your_private_key_here
```

## Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### 1. Get Supported Chains
```http
GET /api/faucet/chains
```

Response:
```json
{
    "success": true,
    "chains": ["sonicBlaze", "mantleSepolia"]
}
```

### 2. Regular Faucet Request
```http
POST /api/faucet
Content-Type: application/json

{
    "address": "0x...",
    "chain": "sonicBlaze"
}
```

Response:
```json
{
    "success": true,
    "chain": "sonicBlaze",
    "txHash": "0x...",
    "amount": "0.05",
    "explorerUrl": "https://testnet.sonicscan.org/tx/0x..."
}
```

### 3. Access Code Faucet Request
```http
POST /api/faucet/access-code
Content-Type: application/json

{
    "address": "0x...",
    "chain": "sonicBlaze",
    "accessCode": "your_access_code"
}
```

Response:
```json
{
    "success": true,
    "chain": "sonicBlaze",
    "txHash": "0x...",
    "amount": "0.05",
    "explorerUrl": "https://testnet.sonicscan.org/tx/0x..."
}
```

## Testing with cURL

1. Get supported chains:
```bash
curl -X GET http://localhost:3001/api/faucet/chains
```

2. Regular faucet request:
```bash
curl -X POST http://localhost:3001/api/faucet \
-H "Content-Type: application/json" \
-d '{
    "address": "0x1234567890123456789012345678901234567890",
    "chain": "sonicBlaze"
}'
```

3. Access code faucet request:
```bash
curl -X POST http://localhost:3001/api/faucet/access-code \
-H "Content-Type: application/json" \
-d '{
    "address": "0x1234567890123456789012345678901234567890",
    "chain": "sonicBlaze",
    "accessCode": "your_access_code"
}'
```

## Error Responses

### 400 Bad Request
```json
{
    "success": false,
    "error": "Address is required"
}
```

### 401 Unauthorized
```json
{
    "success": false,
    "error": "Invalid access code"
}
```

### 500 Internal Server Error
```json
{
    "success": false,
    "error": "Error message details"
}
```

## Security Considerations

1. Keep your private key secure and never commit it to version control
2. Use environment variables for sensitive data
3. Implement rate limiting to prevent abuse
4. Use access codes for controlled distribution

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

ISC License 
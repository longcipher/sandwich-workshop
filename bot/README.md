# Sandwich Workshop Bot

A JavaScript bot that monitors the Ethereum mempool and executes sandwich attacks on UniswapV2 pairs.

> **DISCLAIMER**: This bot is for educational purposes only. Do not use in production.

## Overview

This bot demonstrates the core concepts of MEV (Maximal Extractable Value) extraction through sandwich attacks on UniswapV2.

### How It Works

1. **Monitor Mempool**: Listens for pending `swapExactETHForTokens` transactions
2. **Decode Transaction**: Parses the transaction data to extract swap parameters
3. **Calculate Optimal Input**: Uses binary search to find the most profitable sandwich amount
4. **Construct Bundle**: Creates front and back slice transactions
5. **Submit to Flashbots**: Sends the bundle privately to avoid front-running

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        index.js                              │
│  Main entry point - coordinates all components               │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   constants.js  │  │    parse.js     │  │    relayer.js   │
│  Configuration  │  │   Transaction   │  │   Flashbots     │
│  & Providers    │  │   Decoding      │  │   Integration   │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│    univ2.js     │  │   numeric.js    │  │    utils.js     │
│  UniswapV2      │  │  Binary Search  │  │   Utilities     │
│  Helpers        │  │  & Math         │  │   & Helpers     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Key Components

### `index.js` - Main Entry Point

- Initializes providers and wallet
- Listens for pending transactions
- Coordinates the sandwich attack flow

### `constants.js` - Configuration

- Environment variable validation
- Contract addresses
- Provider and wallet setup

### `parse.js` - Transaction Decoding

- Decodes UniswapV2 Router transaction data
- Extracts swap parameters (path, amountOutMin, deadline)

### `numeric.js` - Sandwich Math

- `binarySearch()`: Finds optimal sandwich input
- `calcSandwichOptimalIn()`: Calculates maximum profitable amount
- `calcSandwichState()`: Computes frontrun, victim, and backrun states

### `univ2.js` - UniswapV2 Helpers

- `getUniv2PairAddress()`: Computes pair addresses off-chain
- `getUniv2Reserve()`: Fetches pair reserves
- `getUniv2DataGivenIn()`: Calculates output given input
- `getUniv2DataGivenOut()`: Calculates input given output

### `relayer.js` - Flashbots Integration

- `fbRequest()`: Makes authenticated Flashbots API calls
- `sendBundleFlashbots()`: Submits bundles to Flashbots
- `callBundleFlashbots()`: Simulates bundles before submission

## Setup

### Prerequisites

- Node.js >= 20.0.0
- An Ethereum RPC endpoint (HTTP and WebSocket)
- A wallet with ETH for gas
- A Flashbots signing key

### Environment Variables

Create a `.env` file in the `bot` directory:

```bash
# Ethereum RPC endpoints
RPC_URL=https://mainnet.infura.io/v3/YOUR_INFURA_KEY
RPC_URL_WSS=wss://mainnet.infura.io/ws/v3/YOUR_INFURA_KEY

# Wallet private key (for sending transactions)
PRIVATE_KEY=0x...

# Flashbots signing key (for authentication)
FLASHBOTS_AUTH_KEY=0x...

# Deployed sandwich contract address
SANDWICH_CONTRACT=0x...
```

### Installation

```bash
# Install dependencies (from repo root)
vp install

# Start the bot (from repo root)
npm run start:bot
```

## Development

### Code Structure

The codebase follows a modular design:

- **Separation of Concerns**: Each file handles a specific responsibility
- **Clear Data Flow**: Transactions flow through parse → numeric → relayer
- **Error Handling**: Graceful handling of network and transaction errors

### Key Algorithms

#### Binary Search for Optimal Input

```javascript
// The profit function is not normally distributed,
// so we use binary search to find the optimal input
const optimalWethIn = binarySearch(
  0, // Lower bound
  parseUnits("100"), // Upper bound (100 ETH)
  calculateProfit, // Profit calculation function
  isProfitable, // Condition checker
);
```

#### Sandwich State Calculation

```javascript
// Three states in a sandwich attack:
// 1. Frontrun: Our buy pushes price up
// 2. Victim: User's swap at worse price
// 3. Backrun: Our sell captures profit
const states = calcSandwichState(
  optimalInput,
  userAmountIn,
  userMinRecv,
  reserveWeth,
  reserveToken,
);
```

## Testing

```bash
# Run with debug logging (inside bot/)
DEBUG=* npm run bot

# Check for syntax errors
node --check index.js
```

## Common Issues

### "Missing env var" Error

Ensure all required environment variables are set in `.env`.

### "WebSocket Connection Failed"

Check that `RPC_URL_WSS` is a valid WebSocket endpoint.

### "Bundle Rejected"

Common reasons:

- Insufficient gas
- Transaction too old
- Bundle simulation failed

## Educational Notes

### Why JavaScript?

JavaScript was chosen for accessibility:

- Large community and documentation
- Easy to understand for beginners
- No compilation required
- Rich ecosystem of Ethereum libraries

### Limitations

This simplified bot does not include:

- Circuit breakers
- Poison token detection
- Multi-hop path optimization
- Gas price optimization
- Error recovery mechanisms

### Further Reading

- [Flashbots Documentation](https://docs.flashbots.net/)
- [UniswapV2 Whitepaper](https://uniswap.org/whitepaper.pdf)
- [MEV Research](https://writings.flashbots.net/)

## License

MIT License

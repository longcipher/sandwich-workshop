# Sandwich Workshop

An educational project demonstrating how sandwich attacks work on UniswapV2 pairs.

> **DISCLAIMER**: This project is for educational purposes only. Do not use in production. The authors are not responsible for any financial losses.

## Overview

This project provides a practical example of how sandwich attacks work on UniswapV2 pairs. It includes:

- **Bot** (`/bot`): A JavaScript bot that monitors the mempool and executes sandwich attacks
- **Contracts** (`/contracts`): Highly optimized Solidity contracts for executing swaps

### What You'll Learn

1. **MEV (Maximal Extractable Value)**: Understanding how value is extracted from transaction ordering
2. **UniswapV2 Mechanics**: How AMMs work and how to calculate optimal swap amounts
3. **Flashbots Integration**: How to submit bundles to Flashbots for private transaction ordering
4. **Gas Optimization**: Techniques for minimizing gas costs in smart contracts

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Sandwich Attack Flow                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. Monitor Mempool                                         │
│     └─> Detect pending swapExactETHForTokens tx            │
│                                                              │
│  2. Calculate Optimal Input                                  │
│     └─> Binary search for max profitable sandwich           │
│                                                              │
│  3. Construct Bundle                                         │
│     ├─> Front slice: Buy tokens (push price up)            │
│     ├─> Victim tx: User's swap (pushes price more)         │
│     └─> Back slice: Sell tokens (capture profit)            │
│                                                              │
│  4. Submit to Flashbots                                      │
│     └─> Private submission, no front-running                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js >= 20.0.0
- Foundry (for contracts)
- An Ethereum RPC endpoint (e.g., Infura, Alchemy)
- A Flashbots signing key

### 1. Clone and Install

```bash
git clone https://github.com/your-username/sandwich-workshop.git
cd sandwich-workshop

# Install dependencies (npm workspaces via Vite+)
vp install

# Install Foundry (if not already installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### 2. Configure Environment

```bash
# Copy the example env file
cp bot/.env.example bot/.env

# Edit bot/.env with your values:
# - RPC_URL: Your Ethereum RPC endpoint
# - RPC_URL_WSS: WebSocket RPC endpoint
# - PRIVATE_KEY: Your wallet private key
# - FLASHBOTS_AUTH_KEY: Flashbots signing key
# - SANDWICH_CONTRACT: Deployed sandwich contract address
```

### 3. Deploy Contracts

```bash
cd contracts
forge script script/DeploySandwich.s.sol \
  --rpc-url $ETH_RPC_URL \
  --broadcast \
  --verify
```

### 4. Run the Bot

```bash
npm run start:bot
```

## Project Structure

```
sandwich-workshop/
├── bot/                          # Sandwich bot (JavaScript)
│   ├── src/
│   │   ├── abi/                  # ABI definitions
│   │   ├── constants.js          # Configuration and providers
│   │   ├── logging.js            # Logging utilities
│   │   ├── numeric.js            # Binary search and sandwich math
│   │   ├── parse.js              # Transaction decoding
│   │   ├── relayer.js            # Flashbots bundle submission
│   │   ├── univ2.js              # UniswapV2 helpers
│   │   └── utils.js              # General utilities
│   ├── index.js                  # Main entry point
│   ├── package.json
│   └── .env.example
├── contracts/                    # Smart contracts (Solidity)
│   ├── src/
│   │   ├── Sandwich.sol          # Main sandwich contract
│   │   ├── interface/            # Contract interfaces
│   │   └── lib/                  # Libraries
│   ├── test/                     # Foundry tests
│   ├── script/                   # Deployment scripts
│   └── foundry.toml
├── package.json                  # Root package.json
└── README.md
```

## How It Works

### 1. Mempool Monitoring

The bot connects to an Ethereum node via WebSocket and listens for pending transactions:

```javascript
wssProvider.on("pending", (txHash) =>
  sandwichUniswapV2RouterTx(txHash).catch((e) => {
    logFatal(`txhash=${txHash} error ${JSON.stringify(e)}`);
  }),
);
```

### 2. Transaction Decoding

When a pending transaction is detected, the bot decodes it to check if it's a UniswapV2 swap:

```javascript
const routerDataDecoded = parseUniv2RouterTx(tx.data);
if (routerDataDecoded === null) return; // Not a swap we can sandwich
```

### 3. Optimal Input Calculation

The bot uses binary search to find the optimal amount to front-run:

```javascript
const optimalWethIn = binarySearch(lowerBound, upperBound, calculateProfit, passCondition);
```

### 4. Bundle Construction

Three transactions are bundled together:

1. **Front slice**: Bot buys tokens, pushing the price up
2. **Victim tx**: User's swap executes at worse price
3. **Back slice**: Bot sells tokens, capturing the profit

### 5. Flashbots Submission

The bundle is submitted privately to Flashbots, preventing front-running:

```javascript
const bundleResp = await sendBundleFlashbots(
  [frontsliceTxSigned, middleTx, backsliceTxSignedWithBribe],
  targetBlockNumber,
);
```

## Key Concepts

### UniswapV2 Constant Product Formula

```
x * y = k
```

Where:

- `x` = reserve of token A
- `y` = reserve of token B
- `k` = constant product

### Sandwich Attack Economics

- **Revenue**: Price impact from sandwiching the victim
- **Cost**: Gas fees for front and back slices
- **Profit**: Revenue - Gas costs

### Flashbots Protection

Flashbots provides:

- **Pre-trade privacy**: Transactions are not visible in public mempool
- **No failed trade cost**: Only pay if bundle is included
- **Atomic execution**: All transactions succeed or all fail

## Limitations

This is a simplified educational example. Production sandwich bots typically include:

- Circuit breakers
- Poison token detection
- Caching systems
- Robust logging (e.g., Grafana)
- Gas optimization techniques
- Multi-chain support

## Resources

- [Flashbots Documentation](https://docs.flashbots.net/)
- [UniswapV2 Documentation](https://docs.uniswap.org/contracts/v2/overview)
- [MEV Research](https://writings.flashbots.net/)
- [Sandwich Attacks Explained](https://medium.com/coinmonks/defi-sandwich-attack-explain-776f6f43b2fd)

## Acknowledgments

Original project by [libevm](https://github.com/libevm/subway). This is an educational fork with enhanced documentation and modern tooling.

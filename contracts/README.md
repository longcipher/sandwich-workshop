# Subway Sandwich Contracts

Highly optimized contracts for UniswapV2 sandwich attacks, built with [Foundry](https://book.getfoundry.sh/).

## Overview

This is a set of highly optimized contracts that can be used for front and back slices in a UniswapV2 [sandwich attack](https://medium.com/coinmonks/defi-sandwich-attack-explain-776f6f43b2fd).

For a sandwich front/back slice, there is only so much optimization that can be done on your contracts. This repository currently includes:

- Avoid using `SLOAD` for owner checking
- Compact payload construction
- Manual memory pointer construction
- Catch-all function signatures

**NOTE: Please be aware that this repository does NOT provide protection against [Uncle Bandit attacks](https://twitter.com/bertcmiller/status/1385294417091760134)**

## Gas Usage

| Single Swap                       | Gas Used |
| --------------------------------- | -------- |
| Univ2 Router                      | 109809   |
| Solidity Inline Assembly Contract | 92422    |

## Development

### Prerequisites

Install [Foundry](https://book.getfoundry.sh/getting-started/installation):

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Setup

```bash
# Install dependencies
forge install

# Set up environment variables
cp .env.example .env
# Edit .env with your RPC URL
```

### Build

```bash
forge build
```

### Test

```bash
# Run all tests
forge test

# Run with gas reporting
forge test --gas-report

# Run specific test
forge test --match-test test_solidity_sandwich_frontslice_optimized
```

### Deploy

```bash
# Deploy to mainnet
forge script script/DeploySandwich.s.sol --rpc-url $ETH_RPC_URL --broadcast --verify
```

## Project Structure

```
contracts/
├── src/
│   ├── Sandwich.sol          # Main sandwich contract
│   ├── interface/
│   │   ├── IERC20.sol        # ERC20 interface
│   │   ├── IUniswapV2.sol    # UniswapV2 interfaces
│   │   └── IWETH.sol         # WETH interface
│   └── lib/
│       └── SafeTransfer.sol  # Safe transfer library
├── test/
│   └── Sandwich.t.sol        # Foundry tests
├── script/
│   └── DeploySandwich.s.sol  # Deployment script
├── foundry.toml              # Foundry configuration
└── README.md
```

## Educational Notes

This project is designed for educational purposes. Key concepts demonstrated:

1. **Gas Optimization**: Using assembly to minimize gas costs
2. **UniswapV2 Integration**: Understanding how DEX swaps work
3. **Flashbots Bundle Construction**: How to submit bundles to Flashbots
4. **Sandwich Attack Mechanics**: The theoretical basis for MEV extraction

**Disclaimer: This code is for educational purposes only. Do not use in production without understanding the risks involved.**

# Default recipe to display help
default:
  @just --list

# Install all dependencies
install:
  yarn install

# Format all code
format:
  bunx biome check --fix .

# Auto-fix linting issues
fix:
  bunx biome check --fix .

# Run all lints
lint:
  bunx biome check .

# Run bot lints
lint-bot:
  cd bot && yarn lint

# Run tests
test:
  vitest run

# Build contracts
build:
  cd contracts && forge build

# Test contracts
test-contracts:
  cd contracts && forge test

# Test contracts with gas report
test-gas:
  cd contracts && forge test --gas-report

# Type check
typecheck:
  npx tsc --noEmit

# Clean build artifacts
clean:
  rm -rf node_modules
  find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
  cd contracts && forge clean

# Full CI check
ci: lint test build test-contracts

# Install all required development tools
setup:
  yarn install
  curl -L https://foundry.paradigm.xyz | bash
  foundryup

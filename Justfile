# Justfile — sandwich-workshop is an npm workspace plus a Foundry project.
#
# `bot/` is the JavaScript bot, checked with Vite+ (Oxfmt, Oxlint, the
# type-aware pass and Vitest). `contracts/` is the Foundry project, checked
# with `forge`. There is no frontend bundle, so `vp build` does not apply.
#
# `forge` is always given `--root contracts`; without it `forge fmt --check`
# finds no Solidity files and reports a false green.
#
# The Markdown lint runs with MD013 (line length), MD040 (fenced code
# language) and MD041 (first-line heading) disabled to match the docs that
# ship in this repo.

# Default recipe to display help
default:
  @just --list

# Install all dependencies (npm workspaces via Vite+)
setup:
  vp install
  cargo install rumdl

# Format all code
format:
  rumdl fmt --disable MD013,MD040,MD041 .
  vp fmt
  forge fmt --root contracts

# Auto-fix what format cannot
fix:
  rumdl check --fix --disable MD013,MD040,MD041 .
  vp check --fix

# Run all lints
lint:
  rumdl check --disable MD013,MD040,MD041 .
  vp check
  forge fmt --root contracts --check

# Run the bot and contract test suites
test:
  vp test --passWithNoTests
  forge test --root contracts

# Build the Solidity contracts
build:
  forge build --root contracts

# Type check the bot sources
check:
  vp check --no-fmt --no-lint

# Fail if Chinese characters appear anywhere
check-cn:
  ! rg --line-number --column "\p{Han}" .

# Full CI check
ci: lint test build

# Run the bot against the configured node
bot:
  npm run start:bot

# Start a local Anvil fork of mainnet
anvil-fork:
  npm run anvil:fork

# Run the Anvil-fork sandwich tutorial
test-fork:
  npm run test:fork

# Install the contract dependencies (forge-std via Soldeer)
deps:
  cd contracts && forge soldeer install

# Remove build artifacts
clean:
  forge clean --root contracts
  rm -rf node_modules bot/node_modules contracts/node_modules

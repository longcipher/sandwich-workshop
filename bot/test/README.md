# Anvil Fork Sandwich Tutorial Test

Demonstrates a complete sandwich attack flow against a local Anvil fork of mainnet.

## Features

- **Zero cost**: no real ETH needed, uses fresh throwaway accounts on the fork
- **No external dependencies**: no Flashbots relay, no real mempool
- **Verbose logs**: every step prints detailed teaching output
- **Repeatable**: deterministic results, great for learning and debugging

## Prerequisites

1. Install [Foundry](https://book.getfoundry.sh/getting-started/installation) (includes `anvil`)
2. An Ethereum mainnet RPC URL (Infura / Alchemy / any public endpoint)

## Usage

### Step 1: Start the Anvil fork

In terminal 1:

```bash
# Option 1: via npm script (requires the ETH_RPC_URL env var)
export ETH_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
npm run anvil:fork

# Option 2: run anvil directly
anvil --fork-url https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
```

### Step 2: Run the test

In terminal 2:

```bash
npm run test:fork
```

## Output Walkthrough

The script prints the following in order:

1. **Connection info** - confirms the Anvil fork connection
2. **Account setup** - searcher and victim addresses
3. **Contract deployment** - Sandwich contract deployed onto the fork
4. **Pool state** - current WETH-USDC reserves and price
5. **WETH prep** - searcher wraps WETH for the frontrun
6. **Victim tx build** - shows the victim tx being sandwiched
7. **Sandwich math** - binary search for the optimal input, sandwich states
8. **Attack execution** - Frontrun -> Victim -> Backrun, in order
9. **Result analysis** - balance changes, profit, price impact

## Example Output

Below is a real run of `npm run test:fork` (exact numbers vary with the
forked mainnet state, e.g. pool reserves at the fork block):

```text
npm run test:fork
npm notice run sandwich-workshop@2.0.0 test:fork
npm notice run node bot/test/fork-sandwich.js
◇ injected env (0) from .env
================================================================================
  Anvil Fork Mainnet Sandwich Attack Tutorial
================================================================================

Step 1: Connect to the local Anvil fork node...

  [OK] Connected to Anvil fork, current block: 26003868

================================================================================
Step 2: Set up the Searcher and Victim accounts...

  Searcher address: 0xe765A775b2227e7637C1E81E73A821CF526ab3F5 (freshly generated)
  Victim address:   0xb9F3848eC9d1F96b8c52F2AE33F63EAEAA17BB9f (freshly generated)
  Funding both new accounts with 500 ETH via anvil_setBalance...
  Searcher ETH balance: 500.0 ETH
  Victim ETH balance:   500.0 ETH
  [OK] Both new accounts funded, no historical code on the fork

================================================================================
Step 3: Deploy the Sandwich contract...

  Deploying Sandwich contract (owner = Searcher)...
  [OK] Sandwich contract deployed: 0xD2978cE8CAA9d0D0F929B404bDB745ddB14d06Ad
  Contract owner: 0xe765A775b2227e7637C1E81E73A821CF526ab3F5 (i.e. the Searcher)

================================================================================
Step 4: Initialize WETH/USDC contracts and the liquidity pool...

  WETH-USDC pair address: 0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc (off-chain CREATE2 computation)
  Current reserves: WETH = 4041.895041913311476566, USDC = 10146453.773197
  Current WETH/USDC price: ~2510.32 USDC per WETH

================================================================================
Step 5: Searcher wraps WETH (frontrun ammo)...

  Searcher wraps 200 WETH...
  [OK] Searcher wrapped 200 WETH
  Searcher WETH balance: 200.0

  Note: the Victim uses swapExactETHForTokens and spends native ETH directly,
  the Router wraps it into WETH internally, so the Victim needs no wrap or approve.

================================================================================
Step 6: Build the Victim swap tx (simulating a pending mempool tx)...

  Victim plans to swap 50 ETH for USDC
  Expected output at current price: 123614.91623 USDC
  amountOutMin (5% slippage tolerance): 117434.170418 USDC
  Victim tx target: Router at 0x7a25...488D
  Victim tx sender: 0xb9F3...BB9f
  [OK] Victim tx built, held back (simulating mempool pending state)

================================================================================
Step 7: Searcher computes the optimal sandwich parameters...

--------------------------------------------------------------------------------
  7.1 Decode the victim tx with the bot's decoder...

  Method: swapExactETHForTokens
  amountOutMin: 117434.170418 USDC
  Path: 0xc02a...6cc2 -> 0xa0b8...eb48
  Recipient: 0xb9f3848ec9d1f96b8c52f2ae33f63eaeaa17bb9f
  Input ETH: 50.0
--------------------------------------------------------------------------------
  7.2 Confirm the pair reserves (pre-attack snapshot)...

  Pair address: 0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc
  WETH reserve: 4041.895041913311476566
  USDC reserve: 10146453.773197
--------------------------------------------------------------------------------
  7.3 Binary-search the optimal frontrun input...

  Searching the 0 ~ 100 ETH range for the optimal WETH input...
  Goal: push the price up just enough that the victim only gets amountOutMin
  Optimal frontrun input: 99.609375 WETH
--------------------------------------------------------------------------------
  7.4 Compute the full sandwich state (frontrun / victim / backrun)...

  Sandwich structure:

  [Frontrun] Searcher buys USDC first, pushing the price up:
    In: 99.609375 WETH
    Out: 243322.832313 USDC

  [Victim] Victim is forced to buy USDC at the worse price:
    In: 50.0 WETH
    Out: 117783.186124 USDC

  [Backrun] Searcher sells the USDC back to WETH, locking in profit:
    In: 243322.832313 USDC
    Out: 101.399589294841274166 WETH

  === Revenue estimate (gross, before gas) ===
  Frontrun cost: 99.609375 WETH
  Backrun proceeds: 101.399589294841274166 WETH
  Gross profit: 1.790214294841274166 WETH

================================================================================
Step 8: Execute the sandwich attack...

  Note: in production a Flashbots bundle guarantees all three txs land
  atomically in the same block. On a local fork nobody competes with us,
  so sending them in order is equivalent.
--------------------------------------------------------------------------------
  8.0 Pre-attack balance snapshot:

    Searcher WETH: 200.0
    Victim USDC:   0.0
    Sandwich WETH: 0.0
    Sandwich USDC: 0.0

--------------------------------------------------------------------------------
  8.1 Frontrun: WETH -> USDC (push the price up)...

  (i) Transfer 99.609375 WETH into the Sandwich contract...
  [OK] WETH moved into the Sandwich contract
  (ii) Call Sandwich.fallback() to run the WETH -> USDC swap...
    token (given, into pair): WETH (0xC02a...6Cc2)
    pair: 0xB4e1...C9Dc
    amountIn: 99.609375 WETH
    amountOut: 243322.832313 USDC
    tokenOutNo: 0 (USDC is token0)
  [OK] Frontrun done! The USDC price has been pushed up

  Post-frontrun state:
    WETH reserve: 4141.504416913311476566
    USDC reserve: 9903130.940884
    New price: ~2391.19 USDC per WETH
    USDC now costs 4.98% more WETH (victim pays more per USDC)

--------------------------------------------------------------------------------
  8.2 Victim tx: the victim trades at the manipulated price...

  Victim sends the swap tx (50 ETH -> USDC)...
  Note: the victim now faces the post-frontrun, inflated price
  [OK] Victim tx executed

  Victim actually received: 117783.186124 USDC
  Without attack it would get: 123614.91623 USDC
  Value extracted from victim: 5831.730106 USDC

--------------------------------------------------------------------------------
  8.3 Backrun: USDC -> WETH (lock in the profit)...

  (i) Call Sandwich.fallback() to run the USDC -> WETH swap...
    token (given, into pair): USDC (0xA0b8...eB48)
    pair: 0xB4e1...C9Dc
    amountIn: 243322.832313 USDC
    amountOut: 101.399589294841274166 WETH
    tokenOutNo: 1 (WETH is token1)
  [OK] Backrun done! USDC swapped back to WETH

--------------------------------------------------------------------------------
  8.4 Recover profit: pull the WETH back from Sandwich to Searcher...

  [OK] Profit pulled back into the searcher wallet

================================================================================
Step 9: Sandwich attack result analysis...

--------------------------------------------------------------------------------
  9.1 Balance comparison before/after the attack:

  +----------------+------------------------------------------------+
  | Account        | Balance change                                 |
  +----------------+------------------------------------------------+
  | Searcher WETH  | 200.0 -> 201.790214294841274166 (+1.790214294841274166)|
  | Sandwich WETH  | 0.0 -> 0.0 (+0.0)                             |
  | Victim USDC    | 0.0 -> 117783.186124 (+117783.186124)         |
  +----------------+------------------------------------------------+
--------------------------------------------------------------------------------
  9.2 Profit analysis:

  === Flow summary ===

  [Frontrun] Searcher buys USDC with WETH -> pushes the USDC price up
  [Victim]   Victim buys USDC at the high price -> suffers slippage loss
  [Backrun]  Searcher sells USDC back to WETH -> takes profit
  [Recover]  Profit pulled from Sandwich contract to searcher wallet

  === Profit (on-chain result, gas already deducted) ===
  Searcher put into Sandwich: 99.609375 WETH
  Searcher got back in total: 101.399589294841274166 WETH
  Net profit:                 1.790214294841274166 WETH

  [OK] Sandwich attack succeeded! The searcher made a profit
--------------------------------------------------------------------------------
  9.3 Price impact analysis:

  Pre-attack price: ~2510.32 USDC per WETH
  Post-frontrun:    ~2391.19 USDC per WETH
  Post-attack price: ~2451.93 USDC per WETH

  Note: the frontrun pushes the price up and the backrun pushes it back,
  so the price ends up close to where it started. The profit comes
  from the slippage the victim suffers.

================================================================================
  Tutorial complete!
================================================================================

  Key takeaways:
  1. Frontrun: buy before the victim, push the price up
  2. Victim:   victim buys at the worse price, suffers slippage loss
  3. Backrun:  sell the previously bought tokens, take profit
  4. Profit source: not created from thin air, extracted from the victim
  5. Real-world constraint: MEV infra like Flashbots is needed for atomicity

  That is how a sandwich attack works.
```

## Teaching Points

This demo shows you:

- How a sandwich attack profits from AMM price impact
- How the frontrun pushes the price up and hurts the victim with slippage
- How the backrun converts the position back into profit
- Why MEV infra like Flashbots is needed (atomicity) in production
- How binary search finds the optimal attack size

## Troubleshooting

### Connection failure

```
[FAIL] Cannot connect to the Anvil node. Make sure an anvil fork is running
```

Make sure Anvil is running and port 8545 is free.

### Contract not compiled

If `Sandwich.json` is missing, compile the contracts first:

```bash
npm run build:contracts
```

### Transaction failure

If a sandwich tx fails, possible causes:

- Forked mainnet reserves differ from expectations
- Slippage tolerance too tight
- Gas limit too low

## Technical Details

- Fresh random accounts funded via `anvil_setBalance` (avoids EIP-7702
  delegation code that anvil dev accounts may carry on a mainnet fork)
- Interacts with real mainnet UniswapV2 contracts (forked state)
- Reuses the math modules in `bot/src/` (pair address, binary search,
  sandwich states) plus the production tx decoder in `bot/src/parse.js`
- Executes swaps through the Sandwich contract fallback function

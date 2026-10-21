# Sandwich Workshop Agent Instructions

## Non-negotiables

- Surgical edits only: every changed line must trace to the request. No drive-by refactors, no reformatting untouched code, no deleting pre-existing dead code (mention it instead).
- Fix root causes. Never silence a warning, weaken a check, or patch a symptom to make a gate pass.
- Never report completion while any `just` gate below fails. Report the failure verbatim and stop.
- Stop and ask when a request is ambiguous, conflicts with existing conventions, or requires credentials, publishing, or destructive operations.
- When a correction reveals a missing rule, add one specific rule here ("always X for Y", never "be careful with Y"); delete rules that never catch real errors.

## Scope

- `sandwich-workshop` is an educational UniswapV2 sandwich-attack demo: a JavaScript bot that front-runs and back-runs a victim's swap inside a Flashbots bundle, plus the Solidity contract that executes the two slices.
- It is an npm workspace with two members: `bot/` (the JavaScript bot) and `contracts/` (the Foundry project). One root `package-lock.json`; `bot/package.json` and `contracts/package.json` carry metadata and scripts only.
- `bot/src/` is a set of single-purpose modules: `constants.js` (env validation, providers, wallets), `parse.js` (router transaction decoding), `numeric.js` (binary search and sandwich math), `univ2.js` (pair address, reserves, AMM math), `relayer.js` (Flashbots bundle submission), `utils.js`, `logging.js`. `bot/index.js` is the entry point.
- `bot/test/fork-sandwich.js` is a standalone teaching script that runs the whole attack against a local Anvil fork of mainnet. It is not a Vitest suite and is not part of `just test`.
- `contracts/` holds `src/Sandwich.sol` (the executor), `src/interface/`, `src/lib/SafeTransfer.sol`, `test/Sandwich.t.sol` and `script/DeploySandwich.s.sol`.
- This is a teaching artifact: no circuit breakers, no poison-token detection, no multi-chain support. Say that plainly before proposing to harden it.
- English only in code, comments, docs, and commit messages.

## Execution

- Parallelize aggressively: dispatch subagents for independent research, exploration, and implementation.
- The bot and the contracts are separate tracks with separate toolchains (npm/Oxlint versus Foundry) — dispatch them in parallel, but never let two agents write the same file.
- NEVER use `git worktree`. Edit the current branch in place.
- TDD for behavior changes: add the failing Vitest case in `bot/` first, make the smallest change that passes it, then run the Solidity suite for the contract side.

## Verification loop

After each feature or bug fix, in order; any failure means the task is not done:

```bash
just format
just lint
just test
```

`format` runs the Vite+ formatter over the bot, `forge fmt` over the contracts and `rumdl fmt` over the Markdown. `lint` runs `vp check` (format, Oxlint and the type-aware pass), `forge fmt --check` and the Markdown lint. `test` runs the Vitest suite and `forge test`. The live bot and the Anvil-fork tutorial need `ETH_RPC_URL` and a deployed contract, so they are separate recipes, not part of `just test`.

## TypeScript rules

- The bot is ESM JavaScript, not TypeScript: `bot/package.json` sets `"type": "module"` and the sources use `import`/`export` only. The two `createRequire(import.meta.url)` uses are deliberate — they load the JSON ABIs and the compiled contract artifact.
- Type safety comes from `tsconfig.json` (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) plus `vp check`'s type-aware pass. Do not introduce `@ts-check` pragmas or JSDoc types into files that have none today.
- `vp` owns the bot's tooling: `vp install`, `vp add`, `vp remove`, `vp update`, `vp fmt`, `vp lint`, `vp check`, `vp test`. Never hand-edit a version in a `package.json` — use `vp add` / `vp remove` / `vp update`.
- Dependency versions are pinned exactly (no ranges) in the root `package.json`; the two workspace manifests declare no versions and resolve by hoisting. Keep it that way.
- The shared devDependency (`vite-plus`) lives in the root `package.json`; the workspace manifests stay metadata-only.
- npm is the package manager — `devEngines.packageManager` pins npm 12.0.2 and `package-lock.json` is the single lockfile. Always commit it.
- The lint configuration lives in `vite.config.ts`: `vite-plus/prefer-vite-plus-imports` is an error, `typeAware` and `typeCheck` are on, and the Vitest globals, `node` environment and `**/*.test.{ts,js}` include pattern are set there.
- `bot/src/constants.js` validates `RPC_URL`, `RPC_URL_WSS`, `PRIVATE_KEY`, `FLASHBOTS_AUTH_KEY` and `SANDWICH_CONTRACT` at import time and calls `process.exit(1)` when one is missing. Keep that check at module scope — importing the module must stay cheap to fail.
- `bot/src/constants.js` reads `process.env` at module scope, so every module that imports it inherits the exit-on-missing-env behaviour. `bot/test/fork-sandwich.js` works around this by assigning the env defaults *before* the dynamic import.
- Log through `bot/src/logging.js` (`logInfo`, `logWarn`, `logError`, `logSuccess`, `logFatal`, `logTrace`, `logDebug`). The convention is coloured console output, not a logging framework — do not introduce `console.log` outside `logging.js` and the timestamp patch in `bot/index.js`.
- Never hardcode a secret. Everything sensitive comes from `bot/.env`; `bot/.env.example` is the template.

## Foundry rules

- `contracts/foundry.toml` pins `solc = "0.8.37"`, `optimizer_runs = 999999` and `evm_version = "osaka"`. Changing `evm_version` shifts the gas numbers the tests log — treat it as a deliberate, documented change.
- `forge-std` is managed by Soldeer (1.16.2, pinned in `[dependencies]` and `soldeer.lock`) and lives in `contracts/dependencies/`. `contracts/remappings.txt` needs *both* lines: the versioned `forge-std-1.16.2/=dependencies/forge-std-1.16.2/` that `forge soldeer install` writes, and the base `forge-std/=dependencies/forge-std-1.16.2/src/` that `import "forge-std/Test.sol"` needs. The base alias is manual — Soldeer will not recreate it.
- If the remappings look wrong, do not hand-edit them: remove `contracts/dependencies/forge-std-1.16.2`, `contracts/soldeer.lock` and `contracts/remappings.txt`, re-run `forge soldeer install` inside `contracts/`, then re-add the base alias.
- `forge` needs `--root contracts` when it runs from the repository root. `forge fmt --check` without `--root` silently finds no Solidity files and passes — a false green.
- `contracts/src/Sandwich.sol` decodes its fallback payload with inline assembly at fixed calldata offsets (`0x00` token, `0x14` pair, `0x28` amountIn, `0x38` amountOut, `0x48` tokenOutNo). `bot/index.js` packs exactly `["address","address","uint128","uint128","uint8"]` for both slices. Change one side and you break the other — this is the load-bearing contract of the repo.
- The fallback is authorised by an `immutable` owner, and assembly cannot read immutables, so the value is copied into a local first. Keep that copy.
- The contract deliberately uses revert strings (`"shoo"`) and `revert(3, 3)` instead of custom errors, and the assembly path is written for gas. Do not "modernise" it without a matching change in the bot and the tests.
- `forge build` is not warning-free by design: `unsafe-typecast` in the test and `internal-function-used-once` in `SafeTransfer.sol` are known. Report them; do not silence them.
- `test_receive_eth` asserts `assertApproxEqAbs(balance, 1 ether, 1)` because Anvil fork mode leaves 1 wei of dust on a freshly created contract. Do not tighten it to an exact equality.
- Run `forge fmt` before committing any Solidity change.

## Dependency choices

- Node.js is pinned in `.node-version`; npm is the package manager; Vite+ (`vp`) provides the formatter, linter, type checker and test runner over the npm workspace.
- The bot depends on `ethers` v6, `dotenv`, `chalk`, `abi-decoder`, `@ethereumjs/common` and `@ethereumjs/tx`. No web framework, no ORM, no extra test framework.
- Vitest globals are enabled in `vite.config.ts` and test files are colocated as `*.test.js` next to the source. There are no JS test files yet, so `just test` runs Vitest with `--passWithNoTests` alongside the Solidity suite.
- Foundry (`forge`, `anvil`) is required for `contracts/` and is not managed by npm.
- `rumdl` lints the Markdown with MD013 (line length), MD040 (fenced code language) and MD041 (first-line heading) disabled, to match the docs that ship in this repo.
- `typos` is not wired in — `contracts/src/Sandwich.sol` carries upstream typos (`Contructor`, `teh`).
- Do not add a linter, formatter or test framework that is not already in the toolchain.

## Code conventions

- ESM only in the bot: top-level `import`/`export`, two-space indent, `const`/`let` (never `var`), named exports.
- `bot/src/` is a collection of small modules, not a package: they import each other by relative path and are never imported as a package.
- Solidity files start with `// SPDX-License-Identifier: MIT` and `pragma solidity ^0.8.37;`.
- Formatting is machine-owned: `vp fmt` for JavaScript, `forge fmt` for Solidity, `rumdl fmt` for Markdown. Never hand-format to a different style.
- The signed bot transactions hardcode `chainId: 1`, and `contracts/foundry.toml` maps the `mainnet` RPC endpoint to `$ETH_RPC_URL`. Keep both pointed at the same chain.

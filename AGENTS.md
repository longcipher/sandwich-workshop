# Sandwich Workshop Agent Instructions

## Scope

- This is an educational project demonstrating sandwich attacks on UniswapV2.
- `bot/` contains the JavaScript sandwich bot.
- `contracts/` contains Solidity smart contracts built with Foundry.
- No frontend/React/browser-specific assumptions.

## Execution Strategy

- Maximize parallelism by dispatching subagents aggressively and consuming tokens freely to complete tasks faster.

## Workspace Rules (Critical)

1. Never manually edit dependency versions in `package.json`; use yarn.
2. Root-level devDependencies belong in root `package.json`.
3. Workspace-specific dependencies belong in workspace `package.json`.
4. Always commit lock files (`yarn.lock`).

## Engineering Principles

### JavaScript Implementation Guidelines

1. Type safety:
   - Use JSDoc type annotations for function parameters and return types.
   - Prefer `@ts-check` comment at top of files for type checking.
   - Use `unknown` over `any`; justify every `any` with a comment.
2. Error handling:
   - Use typed error classes extending `Error`.
   - Never swallow errors with empty `catch {}` blocks.
   - Use `cause` property for error chaining (`new Error('msg', { cause: err })`).
3. Async patterns:
   - Default to `async/await` for all I/O operations.
   - Use `Promise.all()` for independent concurrent operations.
   - Use `Promise.allSettled()` when partial failures are acceptable.
   - Never use callbacks where Promises are available.
4. Observability:
   - Use structured logging with consistent format.
   - Never use `console.log` for production logging.
5. Configuration:
   - Use environment variables validated at startup.
   - Never hardcode secrets; use environment variables.
6. Security:
   - Validate all external input at system boundaries.
   - Use parameterized queries; never concatenate SQL strings.

### Key Design Principles

- Modularity: Design each module so it can be used independently with clear boundaries.
- Performance: Prefer zero-copy patterns, streaming, and native APIs.
- Type Safety: Maintain strong typing across interfaces and internals.

### Solidity Guidelines

1. Use Foundry for building and testing contracts.
2. Follow Solidity best practices: checks-effects-interactions pattern.
3. Use custom errors instead of revert strings.
4. Optimize for gas efficiency.
5. Write comprehensive tests for all contract functionality.

### Common Pitfalls

- Do not use `any` without explicit justification in a comment.
- Do not use `!` (non-null assertion) without verifying the value is guaranteed non-null.
- Do not mutate function parameters; treat them as immutable.
- Always use `const` (preferred) or `let`; never use `var`.

### What to Avoid

- Incomplete implementations: finish features before submitting.
- Large, sweeping changes: keep changes focused and reviewable.
- Mixing unrelated changes: keep one logical change per commit.

## Development Workflow

When fixing failures, identify root cause first, then apply idiomatic fixes instead of suppressing warnings or patching symptoms.

## Testing Requirements

- Unit tests: colocate with source files (`*.test.js` next to `*.js`).
- Integration tests: place in workspace-level `tests/` or `__tests__/` directories.
- Use Vitest's `describe`/`it`/`expect` API consistently.
- Use `vi.mock()` for module mocking; `vi.spyOn()` for spy-based testing.
- Use `beforeEach`/`afterEach` for setup/teardown.

## Language Requirement

- Documentation, comments, and commit messages must be English only.

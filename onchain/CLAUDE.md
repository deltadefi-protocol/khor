# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Khor is a Cardano smart contract protocol implementing a batched decentralized swap system with oracle-based validation. Written in Aiken (functional language targeting Plutus v3).

## Commands

```bash
# Compile validators to Plutus Core
aiken build

# Run all tests
aiken check

# Run tests matching a pattern (e.g. a specific module)
aiken check -m swap_intent

# Run tests with diagnostics
aiken check -D

# Check formatting (CI enforces this)
aiken fmt --check

# Auto-format code
aiken fmt

# Generate HTML documentation
aiken docs
```

CI pipeline order: `aiken fmt --check` → `aiken check -D` → `aiken build`

## Architecture

### Protocol Flow

1. **Oracle Setup** — Deploy a `VaultOracleDatum` UTxO protected by `oracle_nft` (one-shot minting using a specific UTxO reference)
2. **Swap Publishing** — Users mint a swap intent token and lock funds at the `swap_intent` script with a `SwapIntentDatum`
3. **Batch Processing** — Operator withdraws from `swap_intent` (as a staking withdrawal), processing multiple intents simultaneously via `process_batched_swap_intent_validation`
4. **Vault Settlement** — Protocol verifies vault balance changes; both `operator_key` and `dd_key` must sign

### Multi-Validator Coordination

The three validators work together and reference each other:

- `oracle_nft` — One-shot NFT minting; parameterized with a UTxO reference to prevent replay
- `oracle/spend` — Guards the `VaultOracleDatum`; requires operator signature
- `swap_intent` — Parameterized with `oracle_nft` policy ID; has four endpoints:
  - `spend`: Delegates to the withdrawal script (prevents double-spend)
  - `mint`: Validates `SwapIntentDatum` and locks `from_amount` + intent token
  - `withdraw`: Core batch processor — reads oracle via reference input, validates vault change, burns intent tokens, checks dual signatures
  - `publish`: Requires operator signature (via oracle reference input)

### Key Types (`lib/types.ak`)

- `VaultOracleDatum` — Contains `vault_script_hash`, `swap_intent_script_hash`, `operator_key`, `dd_key`
- `SwapIntentDatum` — Contains `account_address`, `from_amount: MValue`, `to_amount: MValue`
- `MValue` — `Pairs<PolicyId, Pairs<AssetName, Int>>` — multi-asset value representation
- `SwapIntentWithdrawRedeemer` — `ProcessIntent(List<Int>)` where indices identify which inputs are swap intents

### Batch Processing Pattern

`process_batched_swap_intent_validation` in `lib/swap_utils.ak` uses a dual-accumulator fold (`list_foldl2`) over the `indices` redeemer to validate each intent and accumulate `total_vault_change`.

The vault balance invariant:

```
value_from_vault == value_to_vault + total_vault_change
```

### Dependencies

- `aiken-lang/stdlib v2.2.0` — standard library
- `sidan-lab/vodka v0.1.14` — provides `cocktail` (transaction helpers) and `mocktail` (test mocking)

### Directory Layout

- `lib/` — Shared types and logic (`types.ak`, `utils.ak`, `swap_utils.ak`)
- `validators/` — On-chain validators
- `validators/tests/` — Test files (mirrors validator structure)
- `spec/` — Formal specifications for oracle and swap intent behavior
- `build/` — Auto-generated; gitignored

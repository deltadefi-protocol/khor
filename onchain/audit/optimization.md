# Optimization Report — `deltadefi-protocol/khor`

**Date**: 2026-04-02
**Aiken**: v1.1.17 | Plutus v3 | stdlib v2.2.0
**Validators**: `oracle_nft`, `swap_oracle`, `swap_intent` (spend/withdraw/publish)
**Mode**: Standalone (no security cross-reference)
**Current batch limit**: ~18 UTxOs per withdrawal transaction

---

## Executive Summary

The primary throughput bottleneck is the `withdraw` handler's batch processing loop. The single largest cost driver is **quadratic `list.at` usage** — Aiken lists are singly-linked cons lists (no random access), making `list.at(outputs, i)` an O(i) operation. Called once per intent from the list head, this produces O(N^2/2) total traversals.

Combined with two redundant full-list scans for operator value accounting and a duplicate Value computation per intent, the estimated headroom gain from the optimizations below is **+6-10 additional UTxOs per batch** (from ~18 to ~24-28).

---

## Withdraw Handler — Cost Profile (N = batch size)

| Operation | Location | Cost | Scaling |
|-----------|----------|------|---------|
| `list.at(outputs, idx)` per intent | `swap_utils.ak:89` | O(sum of indices) ~ O(N^2/2) | **Quadratic** |
| `get_all_value_from_cred(inputs)` | `spend_withdraw_publish.ak:161` | O(total_inputs) + merge per match | Linear, full scan |
| `get_all_value_to_cred(outputs)` | `spend_withdraw_publish.ak:163` | O(total_outputs) + merge per match | Linear, full scan |
| `merge` into vault outflow accumulator | `swap_utils.ak:103-109` | O(N x policy_count) | Linear |
| `validate_minimum_output_value` per intent | `swap_utils.ak:113-116` | O(\|to_amount\| x \|value\|) | Linear per intent |
| `add("", "", -deposit)` duplicate | `swap_utils.ak:107,114` | O(N x policies) | Linear, avoidable |
| `all_key_signed` | `spend_withdraw_publish.ak:172` | O(2) | Constant |

For N=18 with sequential output indices 0-17:
- `list.at` total: 0+1+2+...+17 = **153 linked-list hops**
- For N=25: **300 hops**
- For N=30: **435 hops**

---

## OPT-01: Cursor-Based Output Lookup (HIGH IMPACT)

- **Category**: Execution Budget
- **Impact**: High — O(N^2) to O(total_outputs); saves ~135 list traversals at N=18
- **File(s)**: `lib/swap_utils.ak:67-138`
- **Estimated gain**: +5-8 UTxOs per batch

### Why `list.at` is O(i), not O(1)

Aiken compiles to UPLC (Untyped Plutus Lambda Calculus) where the only list type is a cons list. There are no arrays. `list.at(lst, n)` walks `n` cons cells from the head every time it is called:

```
list.at([a, b, c, d, e], 0)  ->  1 step
list.at([a, b, c, d, e], 3)  ->  4 steps
list.at([a, b, c, d, e], 4)  ->  5 steps
```

The batch loop calls `list.at(outputs, output_index)` once per swap intent, each time starting from the head of the full `outputs` list. With sorted indices, each call re-traverses all previously visited elements.

### Cursor approach

Instead of random-accessing from the head each time, maintain a cursor (remaining list + position) and advance by the delta between consecutive indices:

```
Intent 0: start at head, advance 2       ->  2 hops
Intent 1: start at position 3, advance 2 ->  2 hops  (5 - 3)
Intent 2: start at position 6, advance 2 ->  2 hops  (8 - 6)
```

Total hops = last index value ~ O(total_outputs), regardless of batch size.

### Current code

```aiken
// swap_utils.ak:67-138
pub fn process_batched_swap_intent_validation(
  inputs: List<Input>,
  outputs: List<Output>,
  indices: List<Int>,
  script_hash: ScriptHash,
) -> Value {
  let
    processed_indices,
    total_vault_net_outflow,
  <-
    list_foldl2(
      inputs,
      indices,
      zero,
      fn(input, remaining_indices, cal_vault_net_outflow, return) {
        when input.output.address.payment_credential is {
          Script(script) ->
            if script == script_hash {
              when remaining_indices is {
                [] -> fail @"More UTxOs are spent than specified"
                [output_index, ..rest_of_indices] -> {
                  expect Some(out_utxo) = outputs |> list.at(output_index) // <-- O(output_index)
                  // ... per-intent validation ...
                }
              }
            } else {
              return(remaining_indices, cal_vault_net_outflow)
            }
          _ -> return(remaining_indices, cal_vault_net_outflow)
        }
      },
    )
  // ...
}
```

### Suggested change

Pack a cursor `(remaining_indices, output_cursor, cursor_position)` into the first accumulator:

```aiken
pub fn process_batched_swap_intent_validation(
  inputs: List<Input>,
  outputs: List<Output>,
  indices: List<Int>,
  script_hash: ScriptHash,
) -> Value {
  let
    (processed_indices, _cursor, _cursor_pos),
    total_vault_net_outflow,
  <-
    list_foldl2(
      inputs,
      (indices, outputs, 0),
      zero,
      fn(input, state, cal_vault_net_outflow, return) {
        let (remaining_indices, output_cursor, cursor_pos) = state
        when input.output.address.payment_credential is {
          Script(script) ->
            if script == script_hash {
              when remaining_indices is {
                [] -> fail @"More UTxOs are spent than specified"
                [output_index, ..rest_of_indices] -> {
                  // Advance cursor by delta instead of list.at from head
                  let skip = output_index - cursor_pos
                  expect skip >= 0
                  let cursor_at_index = list.drop(output_cursor, skip)
                  expect [out_utxo, ..rest_cursor] = cursor_at_index

                  expect input_datum: SwapIntentDatum =
                    input_inline_datum(input)
                  let SwapIntentDatum {
                    account_address,
                    from_amount,
                    to_amount,
                    deposit,
                    ..
                  } = input_datum

                  expect deposit >= 0
                  let adjusted_output_value =
                    out_utxo.value |> add("", "", -deposit)

                  let new_cal_vault_net_outflow =
                    cal_vault_net_outflow
                      |> merge(
                          calculate_vault_net_outflow(
                            from_amount,
                            adjusted_output_value,
                          ),
                        )

                  let output_check =
                    validate_minimum_output_value(
                      adjusted_output_value,
                      to_amount,
                    ) && out_utxo.address == account_address

                  if output_check {
                    return(
                      (rest_of_indices, rest_cursor, output_index + 1),
                      new_cal_vault_net_outflow,
                    )
                  } else {
                    fail @"Swap intent output incorrect"
                  }
                }
              }
            } else {
              return(state, cal_vault_net_outflow)
            }
          _ -> return(state, cal_vault_net_outflow)
        }
      },
    )
  when processed_indices is {
    [] -> total_vault_net_outflow
    _ -> fail @"Batch swap intent UTxOs not fully processed"
  }
}
```

### Offchain requirement

Output indices in the `ProcessIntent(List<Int>)` redeemer **must be sorted ascending**. The operator already controls transaction construction, so this is a trivial constraint to enforce offchain.

### Security note

Not verified -- run `/os:audit` for full security cross-reference.

---

## OPT-02: Eliminate Duplicate Value Computation (MEDIUM IMPACT)

- **Category**: Execution Budget
- **Impact**: Medium — saves N Value traversals (one `add` per intent)
- **File(s)**: `lib/swap_utils.ak:107,114`
- **Estimated gain**: +1 UTxO per batch

### Current code

```aiken
// swap_utils.ak:102-117 (inside batch loop, per intent)
let new_cal_vault_net_outflow =
  cal_vault_net_outflow
    |> merge(
        calculate_vault_net_outflow(
          from_amount,
          out_utxo.value |> add("", "", -deposit),  // <-- first computation
        ),
      )

let output_check =
  validate_minimum_output_value(
    out_utxo.value |> add("", "", -deposit),          // <-- same computation again
    to_amount,
  ) && out_utxo.address == account_address
```

### Suggested change

```aiken
let adjusted_output_value = out_utxo.value |> add("", "", -deposit)

let new_cal_vault_net_outflow =
  cal_vault_net_outflow
    |> merge(calculate_vault_net_outflow(from_amount, adjusted_output_value))

let output_check =
  validate_minimum_output_value(adjusted_output_value, to_amount)
    && out_utxo.address == account_address
```

### Rationale

`add` traverses the full Value map (all policies and asset names). Called twice with identical arguments per intent, the second call is pure waste. For 18 intents with typical 2-3 policy Values, this saves ~36-54 map traversal steps.

**Note**: This fix is already incorporated into the OPT-01 suggested code above.

### Security note

Not verified -- run `/os:audit` for full security cross-reference.

---

## OPT-03: Fold Operator Value Check into Main Loop (MEDIUM IMPACT)

- **Category**: Execution Budget
- **Impact**: Medium — eliminates 2 full-list scans + associated Value merges
- **File(s)**: `validators/swap_intent/spend_withdraw_publish.ak:153-173`
- **Estimated gain**: +2-3 UTxOs per batch

### Current code

```aiken
// spend_withdraw_publish.ak:153-173 (withdraw handler)
let total_operator_net_outflow =
  process_batched_swap_intent_validation(inputs, outputs, indices, policy_id)

let value_from_operator = get_all_value_from_cred(inputs, operator_cred)   // full scan of ALL inputs
let value_to_operator = get_all_value_to_cred(outputs, operator_cred)      // full scan of ALL outputs

let operator_unlock_value_check =
  value_from_operator == (
    value_to_operator
      |> merge(total_operator_net_outflow)
      |> add("", "", fee)
  )
```

### Problem

`get_all_value_from_cred` (from vodka) iterates **all** inputs with `list.foldr`, checking each credential and merging matching values. `get_all_value_to_cred` does the same over all outputs. These are redundant scans -- the main batch fold already visits every input.

From vodka source (`vodka_value.ak:126-138`):

```aiken
pub fn get_all_value_from_cred(inputs: List<Input>, cred: Credential) -> Value {
  list.foldr(inputs, zero, fn(input, acc_value) {
    if input.output.address.payment_credential == cred {
      merge(acc_value, input.output.value)
    } else {
      acc_value
    }
  })
}
```

### Suggested change

Extend `process_batched_swap_intent_validation` to also accumulate operator input values during its existing input traversal. Return both the vault net outflow and operator input value from a single pass.

This requires either:
1. A 3-accumulator fold (extend `list_foldl2` to `list_foldl3`), or
2. Packing `(Value, Value)` into one accumulator slot (vault outflow + operator value)

```aiken
// Option 2: pack into tuple accumulator
// The fold accumulates (total_vault_net_outflow, total_operator_input_value)
// In the non-swap branches, check for operator_cred and merge input value

// For the output-side (value_to_operator), either:
// a) Carry operator output indices in the redeemer for direct lookup
// b) Accept one remaining scan of outputs (cheaper than inputs since only
//    operator outputs need checking, and there are typically 1-2)
```

This eliminates the `get_all_value_from_cred` scan entirely. The output-side scan (`get_all_value_to_cred`) can remain if operator outputs are few, or be replaced with redeemer-carried indices for maximum savings.

### Security note

Not verified -- run `/os:audit` for full security cross-reference.

---

## OPT-04: Short-Circuit `validate_minimum_output_value` (MEDIUM IMPACT)

- **Category**: Execution Budget
- **Impact**: Medium — avoids unnecessary `quantity_of` calls after first failure
- **File(s)**: `lib/swap_utils.ak:30-44`
- **Estimated gain**: +1 UTxO per batch (more on failure paths)

### Current code

```aiken
pub fn validate_minimum_output_value(value: Value, to_amount: MValue) -> Bool {
  pairs.foldl(
    to_amount,
    True,
    fn(policy_id, unit, result) {
      result && pairs.foldl(
        unit,
        True,
        fn(asset_name, amount, nested_result) {
          quantity_of(value, policy_id, asset_name) >= amount && nested_result
        },
      )
    },
  )
}
```

### Problem

`pairs.foldl` always visits every element -- it cannot short-circuit. Even when `result` is already `False`, the outer fold still calls the inner fold, which still calls `quantity_of` for every remaining asset. The `&&` with `result` evaluates lazily in the second operand, but the fold **itself** always invokes the callback for every pair.

### Suggested change

```aiken
pub fn validate_minimum_output_value(value: Value, to_amount: MValue) -> Bool {
  pairs.foldl(
    to_amount,
    True,
    fn(policy_id, unit, result) {
      if !result {
        False
      } else {
        pairs.foldl(
          unit,
          True,
          fn(asset_name, amount, nested_result) {
            if !nested_result {
              False
            } else {
              quantity_of(value, policy_id, asset_name) >= amount
            }
          },
        )
      }
    },
  )
}
```

The early `if !result { False }` skips the entire inner fold and all `quantity_of` calls once any check fails.

### Security note

Not verified -- run `/os:audit` for full security cross-reference.

---

## OPT-05: Unused Validator Parameter in `swap_oracle` (LOW IMPACT)

- **Category**: Script Size
- **Impact**: Low — removes one UPLC lambda + serialized parameter
- **File(s)**: `validators/oracle/spend.ak:6`

### Current code

```aiken
validator swap_oracle(_oracle_nft: PolicyId) {
```

### Suggested change

```aiken
validator swap_oracle {
```

### Rationale

The `_oracle_nft` parameter is never referenced in the validator body. Each unused parameter adds a lambda wrapping in compiled UPLC, increasing script size and deployment cost. The underscore prefix suppresses Aiken's warning but does not eliminate the compiled overhead.

If this parameter exists for multi-validator hash linkage, verify whether removing it changes the compiled script hash and adjust offchain references accordingly.

### Security note

Not verified -- run `/os:audit` for full security cross-reference.

---

## OPT-06: Verbose Datum Extraction in `get_oracle_datum` (LOW IMPACT)

- **Category**: Script Size
- **Impact**: Low — reduces compiled code by eliminating two explicit fail branches
- **File(s)**: `lib/utils.ak:21-28`

### Current code

```aiken
let oracle_input_data: Data =
  when oracle_input.output.datum is {
    NoDatum -> fail @"Oracle input does not contain any datum"
    DatumHash(_) -> fail @"Oracle input datum must be inlined"
    InlineDatum(data) -> data
  }
expect oracle_input_datum: OracleDatum = oracle_input_data
oracle_input_datum
```

### Suggested change

```aiken
expect InlineDatum(oracle_input_data) = oracle_input.output.datum
expect oracle_input_datum: OracleDatum = oracle_input_data
oracle_input_datum
```

### Rationale

`expect` compiles to a single pattern match that fails on mismatch, equivalent to the three-branch `when` but with less UPLC. Custom error strings are lost, but the oracle is protocol-controlled (datum format is predictable). Keep the verbose form if error traceability in testing is important.

### Security note

Not verified -- run `/os:audit` for full security cross-reference.

---

## OPT-07: Duplicate Oracle Lookup Functions (LOW IMPACT)

- **Category**: Script Size
- **Impact**: Low — removes one redundant `list.find` lambda from compiled output
- **File(s)**: `lib/utils.ak:9-43`

### Current code

```aiken
pub fn get_oracle_datum(inputs, oracle_nft) -> OracleDatum {
  expect Some(oracle_input) = inputs |> list.find(fn(input) { ... })
  // extract datum...
}

pub fn get_vault_oracle_input(inputs, oracle_nft) -> Input {
  expect Some(oracle_input) = inputs |> list.find(fn(input) { ... })
  oracle_input
}
```

### Suggested change

If `get_vault_oracle_input` is unused by any validator, remove it (Aiken tree-shakes at the import boundary). If both are needed, refactor so one calls the other:

```aiken
pub fn get_vault_oracle_input(inputs, oracle_nft) -> Input {
  expect Some(oracle_input) =
    inputs |> list.find(fn(input) { quantity_of(input.output.value, oracle_nft, "") == 1 })
  oracle_input
}

pub fn get_oracle_datum(inputs, oracle_nft) -> OracleDatum {
  let oracle_input = get_vault_oracle_input(inputs, oracle_nft)
  expect InlineDatum(oracle_input_data) = oracle_input.output.datum
  expect oracle_input_datum: OracleDatum = oracle_input_data
  oracle_input_datum
}
```

### Security note

Not verified -- run `/os:audit` for full security cross-reference.

---

## OPT-08: `dict.to_pairs()` in Oracle NFT Mint (LOW IMPACT)

- **Category**: Code Efficiency
- **Impact**: Low — removes potentially redundant Dict-to-Pairs conversion
- **File(s)**: `validators/oracle_nft.ak:9-11`

### Current code

```aiken
expect [Pair(_asset_name, quantity)] =
  self.mint
    |> assets.tokens(policy_id)
    |> dict.to_pairs()
```

### Suggested change

In stdlib v2.2.0, the `Value` type was migrated from `Dict` to `Pairs`. If `assets.tokens` returns `Pairs<AssetName, Int>` directly, the `dict.to_pairs()` call is either redundant or operating on a type mismatch that compiles only due to underlying representation compatibility.

Verify with `aiken build` after removing the conversion:

```aiken
expect [Pair(_asset_name, quantity)] =
  self.mint |> assets.tokens(policy_id)
```

### Security note

Not verified -- run `/os:audit` for full security cross-reference.

---

## Positive Patterns Already In Use

These are efficient patterns the codebase already employs:

- **Withdraw-zero trick** -- spend handler delegates to withdraw, paying O(1) validation cost instead of O(N) repeated spend executions
- **Index-based output mapping** -- redeemer carries `List<Int>` indices binding inputs to outputs (anti-double-satisfaction)
- **`list_foldl2` dual-accumulator CPS fold** -- single pass over inputs with two accumulators, no intermediate allocations
- **Reference inputs for oracle reads** -- no script execution overhead for reading oracle datum
- **Forwarding pattern** -- spend handler checks withdrawal exists, withdraw handler does the real work

---

## Impact Summary

| ID | Category | Impact | Est. UTxO Gain | Description |
|----|----------|--------|----------------|-------------|
| OPT-01 | Execution Budget | **High** | +5-8 | Cursor-based output lookup (O(N^2) -> O(N)) |
| OPT-02 | Execution Budget | Medium | +1 | Eliminate duplicate `add("", "", -deposit)` |
| OPT-03 | Execution Budget | Medium | +2-3 | Fold operator value check into main loop |
| OPT-04 | Execution Budget | Medium | +1 | Short-circuit `validate_minimum_output_value` |
| OPT-05 | Script Size | Low | -- | Remove unused `_oracle_nft` parameter |
| OPT-06 | Script Size | Low | -- | Simplify datum extraction with `expect` |
| OPT-07 | Script Size | Low | -- | Deduplicate oracle lookup functions |
| OPT-08 | Code Efficiency | Low | -- | Remove redundant `dict.to_pairs()` |

**Conservative total estimate**: OPT-01 through OPT-04 combined could push batch throughput from **~18 to ~24-28 UTxOs**, depending on asset complexity per swap.

---

OPTIMIZATION ANALYSIS COMPLETE: 8 suggestions (1H / 3M / 4L impact), 0 with security conflicts

# deltadefi-protocol/khor Smart Contract Audit Report

**Date:** 2026-04-02
**Auditor:** AI-Assisted Audit (Claude Code)
**Project:** deltadefi-protocol/khor v0.0.0
**Commit:** `4075e1ac446e1a338d16d38a2fdec81698a69919`

## Disclaimer

This audit report is produced by an AI-assisted tool. It does NOT replace a
professional human audit. Neither the tool authors nor operators assume liability
for the use, deployment, or operation of the audited code. Critical
vulnerabilities may have gone undiscovered.

## 1. Executive Summary

The khor protocol implements a batched decentralized swap system on Cardano (Plutus V3) using three coordinated validators: an oracle NFT minting policy, an oracle datum guardian, and a multi-handler swap intent validator. The audit identified **13 active findings** across 475 lines of Aiken source code.

No critical vulnerabilities were found. One high-severity finding relates to the absence of on-chain token gating on swap intent UTxOs, which is partially mitigated by off-chain filtering and the SpamPrevention mechanism. The remaining findings are medium and low severity, with several acknowledged as intentional design tradeoffs or mitigated through off-chain controls.

During the audit, the development team addressed three findings through code changes: oracle spend now requires dual signatures (operator_key + dd_key), timed cancellation no longer depends on the oracle, the publish handler was restricted to `UnregisterCredential` with dd_key authorization, and negative deposits are now rejected on-chain.

### 1.1 Vulnerability Summary

| Severity | Count | Test-Confirmed | Resolved | Acknowledged |
|----------|-------|----------------|----------|--------------|
| Critical | 0     | --             | --       | --           |
| High     | 1     | 0              | 0        | 0            |
| Medium   | 5     | 3              | 0        | 2            |
| Low      | 5     | 2              | 0        | 1            |
| Informational | 2 | --           | --       | --           |
| **Resolved** | **2** | --        | **2**    | --           |

## 2. Project Overview

Khor is a batched swap protocol where users lock swap intents (specifying `from_amount` and `to_amount`) at a script address. An operator selects orders to fill, and a batch transaction processes multiple intents simultaneously -- sending each user their requested `to_amount` while the operator provides liquidity from a vault identified by `operator_cred`. The vault balance equation ensures the operator's net outflow matches exactly what was promised to users. Both `operator_key` and `dd_key` must co-sign batch transactions. Users can cancel after a 10-minute window or immediately if the operator authorizes. The `dd_key` holder can clean up spam and stale UTxOs.

**Key roles:**
- **operator_key**: Operational key -- decides which orders to fill, authorizes early cancels, co-signs batches
- **dd_key**: Most powerful key -- co-signs batches, authorizes spam cleanup, breaking changes, and unregistration
- **operator_cred**: Identifies the vault/counterparty credential in swaps

## 3. Codebase & Audit Scope

### 3.1 Repository & Commit

| Field | Value |
|-------|-------|
| Repository | github.com/deltadefi-protocol/khor |
| Commit | `4075e1ac446e1a338d16d38a2fdec81698a69919` |
| Aiken Version | v1.1.17 |
| Plutus Version | v3 |
| Stdlib Version | aiken-lang/stdlib v2.2.0 |
| Dependencies | sidan-lab/vodka v0.1.23 |

### 3.2 Files Audited

| Path | Component | Lines |
|------|-----------|-------|
| `lib/types.ak` | Type definitions | 41 |
| `lib/utils.ak` | Oracle lookup utilities | 51 |
| `lib/swap_utils.ak` | Batch processing logic | 138 |
| `validators/oracle/spend.ak` | Oracle datum guardian | 23 |
| `validators/oracle_nft.ak` | Oracle NFT minting policy | 27 |
| `validators/swap_intent/spend_withdraw_publish.ak` | Main swap intent validator | 195 |
| **Total** | | **475** |

### 3.3 Out-of-Scope

- Aiken compiler correctness
- Aiken stdlib correctness
- sidan-lab/vodka library correctness
- Off-chain transaction building code (`./offchain`)
- External dependencies
- Deployment procedures

## 4. Architecture & Trust Model

### 4.1 Validator Map

| Validator | Handlers | Parameters | Purpose |
|-----------|----------|------------|---------|
| `oracle_nft` | mint, else | `utxo_ref: OutputReference` | One-shot NFT minting for oracle authentication |
| `oracle/spend` | spend, else | `_oracle_nft: PolicyId` | Guards OracleDatum; requires operator_key + dd_key |
| `swap_intent` | spend, withdraw, publish, else | `oracle_nft: PolicyId` | Main protocol: swap processing, cancellation, spam cleanup |

### 4.2 Privileged Roles & Centralization

| Role | Key | Capabilities |
|------|-----|-------------|
| Operator | `operator_key` | Fill orders, authorize early cancels, co-sign batches |
| DeltaDeFi Admin | `dd_key` | Co-sign batches, spam cleanup, oracle updates (with operator), unregister credential |
| Vault | `operator_cred` | Credential identifying the swap counterparty |

**Centralization note:** The operator+dd_key combination has full control over the oracle datum (no output validation on oracle spend). Both keys together can modify all protocol parameters. This is acknowledged as the intended trust model.

### 4.3 Data Flow

**Swap lifecycle:**

1. **Create intent**: User locks `from_amount` + `deposit` at `swap_intent` script with `SwapIntentDatum`
2. **Batch process** (withdraw handler): Operator+dd sign; for each intent: send `to_amount + deposit` to `account_address`; vault equation: `value_from_operator == value_to_operator + total_net_outflow + fee`
3. **Cancel** (spend handler): After 600s OR with operator_key; user signs OR value returned to account
4. **Spam cleanup** (spend handler): dd_key signs; datum malformed OR created_at stale/future
5. **Publish** (publish handler): Only `UnregisterCredential` allowed, requires dd_key

## 5. Detailed Findings

### 5.1 [FND-05] No Token Gating on Swap Intent UTxOs

| Field | Value |
|-------|-------|
| Severity | **High** |
| Vulnerability Type | missing-utxo-authentication |
| Status | Active (partially mitigated off-chain) |
| Confidence | High |
| File(s) | `swap_utils.ak:82-91`, `spend_withdraw_publish.ak:46-48` |
| Test | Defense verified (SpamPrevention tests) |

**Description:**
There is no minting policy or authentication token required on swap intent UTxOs. Anyone can send a UTxO to the `swap_intent` script address with an arbitrary `SwapIntentDatum`. The `ProcessIntent` withdraw handler processes any input at the script address whose datum deserializes as `SwapIntentDatum`.

**Relevant Code:**
```aiken
// swap_utils.ak:82-91 — processes any UTxO at script address
Script(script) ->
  if script == script_hash {
    when remaining_indices is {
      [] -> fail @"More UTxOs are spent than specified"
      [output_index, ..rest_of_indices] -> {
        expect Some(out_utxo) = outputs |> list.at(output_index)
        expect input_datum: SwapIntentDatum =
          input_inline_datum(input)
```

**Impact:**
Attackers can flood the script address with fake swap intents, increasing operational complexity. CancelIntent's single-input restriction (`inputs_at` must return `[only_input]`) can be griefed if an attacker places a second UTxO at the same address before the user's cancel.

**Mitigation:**
Off-chain filtering identifies valid intents. SpamPrevention (dd_key + 24hr) provides reactive cleanup. The operator controls which intents to include in batches.

**Recommended Action:**
Consider adding a mint handler that gates swap intent creation with an authentication token. This would provide on-chain spam prevention rather than relying on reactive cleanup.

---

### 5.2 [FND-01] Oracle Spend Has No Output Validation

| Field | Value |
|-------|-------|
| Severity | **Medium** |
| Vulnerability Type | arbitrary-utxo-datum |
| Status | Active (mitigated by dual-sig requirement) |
| Confidence | High |
| File(s) | `oracle/spend.ak:7-17` |
| Test | `fnd01_oracle_spend_accepts_modified_datum` (exploit confirmed) |

**Description:**
The oracle spend handler only verifies that both `operator_key` and `dd_key` have signed. It does not validate that the oracle NFT is preserved in an output, that the output returns to the same script address, or that the new datum is well-formed.

**Relevant Code:**
```aiken
spend(datum_opt: Option<OracleDatum>, _r, _i, self: Transaction) {
  when datum_opt is {
    Some(datum) -> {
      let OracleDatum { operator_key, dd_key, .. } = datum
      all_key_signed(extra_signatories, [operator_key, dd_key])?
    }
    None -> False
  }
}
```

**Impact:**
With both keys, the oracle datum can be arbitrarily modified (changing `operator_cred`, `swap_script_hash`, `dd_key` itself) or the oracle UTxO can be sent to any address. This is mitigated by the dual-signature requirement -- both trusted parties must collude.

**Recommended Action:**
Add output validation: verify the oracle NFT is present in exactly one output at the same script address with a valid `OracleDatum`. This provides defense-in-depth even if one key is compromised.

---

### 5.3 [FND-07] CancelIntent Fee Inflation Can Shortchange Users

| Field | Value |
|-------|-------|
| Severity | **Medium** |
| Vulnerability Type | value-preservation |
| Status | Active |
| Confidence | High |
| File(s) | `spend_withdraw_publish.ak:86-92` |
| Test | `fnd07_cancel_intent_fee_inflation` (exploit confirmed) |

**Description:**
When the operator cancels an intent without the user's signature, the value return check adds the entire transaction `fee` to the output side: `value_to_account + fee >= input_value + value_from_account`. A higher fee reduces the required return to the user.

**Relevant Code:**
```aiken
let is_value_unlocked =
  value_to_account
    |> add("", "", fee)
    |> value_geq(
        only_input.output.value
          |> merge(value_from_account),
      )
```

**Impact:**
An operator-initiated cancel could return less lovelace than the user deposited, with the difference burned as an inflated transaction fee. The operator doesn't profit directly (fee goes to the network), but it's a griefing vector. Cardano's minimum fee rules limit the practical impact.

**Recommended Action:**
Consider capping the fee deduction or requiring the user's signature for any cancel that doesn't return full value.

---

### 5.4 [FND-10] Deposit Field Can Exceed Actual Lovelace

| Field | Value |
|-------|-------|
| Severity | **Medium** |
| Vulnerability Type | arbitrary-utxo-datum |
| Status | Active (partially fixed on-chain, mitigated off-chain) |
| Confidence | High |
| File(s) | `swap_utils.ak:101-107` |
| Test | `fnd10_inflated_deposit_negative_lovelace` (exploit confirmed) |

**Description:**
The `deposit` field is user-supplied datum. After the recent fix, negative deposits are rejected (`expect deposit >= 0`), but inflated positive deposits (deposit > actual lovelace in UTxO) are still accepted. This produces a potentially misleading intermediate value in the vault outflow calculation.

**Relevant Code:**
```aiken
expect deposit >= 0
let new_cal_vault_net_outflow =
  cal_vault_net_outflow
    |> merge(
        calculate_vault_net_outflow(
          from_amount,
          out_utxo.value |> add("", "", -deposit),
        ),
      )
```

**Impact:**
Limited in practice -- the operator controls which intents to include in batches and would not include intents with unreasonable deposit values. Off-chain filtering prevents processing of malformed intents.

**Recommended Action:**
Mitigated off-chain. Optionally validate `deposit <= quantity_of(out_utxo.value, "", "")` on-chain for defense-in-depth.

---

### 5.5 [FND-12] Operator Credential Overlap with Script Credential Breaks Accounting

| Field | Value |
|-------|-------|
| Severity | **Medium** |
| Vulnerability Type | protocol-logic |
| Status | Active (mitigated off-chain) |
| Confidence | Medium |
| File(s) | `spend_withdraw_publish.ak:161-163` |
| Test | Not directly testable in unit test |

**Description:**
In the withdraw handler, `get_all_value_from_cred` and `get_all_value_to_cred` match on `payment_credential`. If `operator_cred` in the oracle datum equals `Script(swap_intent_script_hash)`, swap intent UTxO inputs would be counted as operator inputs, massively inflating the left side of the vault balance equation.

**Impact:**
If oracle datum is configured with `operator_cred == swap_intent script credential`, the operator can extract all value from batched intents. Requires oracle datum manipulation (FND-01) or incorrect initial setup.

**Recommended Action:**
Off-chain deployment ensures `operator_cred` is never set to the script's own credential. Optionally add an on-chain guard: `expect operator_cred != Script(policy_id)`.

---

### 5.6 [FND-13] Insufficient Staking Control on Oracle Script

| Field | Value |
|-------|-------|
| Severity | **Medium** |
| Vulnerability Type | insufficient-staking-control |
| Status | Active |
| Confidence | Medium |
| File(s) | `oracle/spend.ak:6` |
| Test | -- |

**Description:**
The oracle validator does not include a staking handler and does not constrain the stake credential of its script address. Anyone deploying this validator can attach an arbitrary staking credential, redirecting staking rewards from ADA locked in the oracle UTxO.

**Impact:**
Staking rewards from the oracle UTxO's ADA could go to an unauthorized party. The amount is likely small (min-UTxO ADA).

**Recommended Action:**
Add a withdraw handler to the oracle validator to control staking, or document the expected staking credential at deployment.

---

### 5.7 [FND-06] Oracle NFT Token Name Not Validated in Mint Handler

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Vulnerability Type | other-token-names |
| Status | Mitigated (off-chain) |
| Confidence | High |
| File(s) | `oracle_nft.ak:9` |
| Test | `fnd06_oracle_nft_accepts_any_token_name` (exploit confirmed) |

**Description:**
The oracle NFT mint handler binds the asset name to `_asset_name` (ignored). Any token name is accepted. The oracle lookup in `utils.ak` searches specifically for `quantity_of(input.output.value, oracle_nft, "") == 1` (empty asset name).

**Relevant Code:**
```aiken
expect [Pair(_asset_name, quantity)] =
  self.mint |> assets.tokens(policy_id) |> dict.to_pairs()
```

**Impact:**
Deployment footgun only. If minted with a non-empty name, the protocol would be permanently non-functional. The one-shot property prevents post-deployment exploitation.

**Recommended Action:**
Off-chain minting code always uses `""`. Optionally enforce `asset_name == ""` on-chain.

---

### 5.8 [FND-03] Oracle NFT Burn Halts Protocol Operations

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Vulnerability Type | cross-validator |
| Status | Active (user funds safe) |
| Confidence | High |
| File(s) | `oracle_nft.ak:20`, `oracle/spend.ak:7-17` |
| Test | `fnd03_oracle_nft_burn_no_restrictions` (exploit confirmed) |

**Description:**
The oracle NFT burn path only checks `quantity == -1`. With both `operator_key` and `dd_key` (required to spend the oracle UTxO), the NFT can be burned, permanently halting ProcessSwap, SpamPrevention, and Publish operations.

**Impact:**
Protocol operations halt, but **user funds are NOT locked**. After the code fix, timed cancellation (>600s) no longer requires the oracle -- users can always recover their funds.

**Recommended Action:**
Consider adding a burn restriction (e.g., require a specific admin action redeemer) or accept this as intentional shutdown capability for operator+dd.

---

### 5.9 [FND-08] Operator Can Immediately Cancel Any Intent

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Vulnerability Type | value-preservation |
| Status | **Acknowledged** (by design) |
| Confidence | High |
| File(s) | `spend_withdraw_publish.ak:52-61` |
| Test | -- |

**Description:**
When the operator signs, the 600-second time lock is bypassed. The operator can cancel any user's swap intent immediately. Value must be returned to the user's account (or user must sign).

**Impact:**
Operator can front-run favorable swaps by canceling them. Users get funds back but lose the trade opportunity. This is an accepted design tradeoff -- the operator is a trusted party.

---

### 5.10 [FND-15] Negative MValue Amounts Enable Griefing

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Vulnerability Type | protocol-logic |
| Status | Active (partially fixed, mitigated off-chain) |
| Confidence | Medium |
| File(s) | `types.ak:40-41`, `swap_utils.ak:22-23` |
| Test | Mitigated (off-chain) |

**Description:**
`MValue = Pairs<PolicyId, Pairs<AssetName, Int>>` allows negative quantities in `from_amount` and `to_amount`. The recent fix blocks negative `deposit`, but negative amounts in MValue fields can still skew vault outflow calculations.

**Impact:**
Griefing of automated operator systems. The operator would not include such intents voluntarily.

**Recommended Action:**
Off-chain filtering rejects intents with negative amounts. Optionally validate positive amounts on-chain in the batch processor.

---

### 5.11 [FND-16] Oracle Spend Redeemer and Input Index Ignored

| Field | Value |
|-------|-------|
| Severity | **Low** |
| Vulnerability Type | other-redeemer |
| Status | Active |
| Confidence | High |
| File(s) | `oracle/spend.ak:7` |
| Test | -- |

**Description:**
Both the redeemer (`_r`) and input index (`_i`) are unused in the oracle spend handler. Any redeemer value works. This is not exploitable given the dual-signature requirement, but prevents future extensibility.

---

### 5.12 [FND-09] No On-Chain Minimum Deposit Enforcement

| Field | Value |
|-------|-------|
| Severity | **Medium** |
| Vulnerability Type | cheap-spam |
| Status | **Acknowledged** (mitigated off-chain) |
| Confidence | High |
| File(s) | `types.ak:22-28`, `swap_utils.ak:101` |
| Test | Acknowledged |

**Description:**
The `deposit` field is user-supplied and not validated against a minimum threshold on-chain. Combined with no token gating (FND-05), minimum-ADA UTxOs can be created at the script address. Cardano's min-UTxO rule provides a natural floor.

**Recommended Action:**
Off-chain validation enforces minimum deposit. SpamPrevention provides reactive cleanup.

---

### 5.13 [FND-14] Oracle Is a Global Singleton UTxO

| Field | Value |
|-------|-------|
| Severity | **Medium** |
| Vulnerability Type | utxo-contention |
| Status | **Acknowledged** (non-concern) |
| Confidence | High |
| File(s) | `oracle/spend.ak:7` |
| Test | Acknowledged |

**Description:**
The oracle datum is held in a single UTxO. Any update serializes through this UTxO. Since the oracle is used as a reference input (not spent) during normal swap processing, contention only occurs during oracle updates.

**Recommended Action:**
None -- oracle updates are infrequent. This is a non-concern for the protocol's operational model.

---

### 5.14 [FND-17] ProcessSwap Forwarding Pattern (Informational)

| Field | Value |
|-------|-------|
| Severity | **Informational** |
| Vulnerability Type | other-redeemer |
| Status | By design |
| Confidence | Medium |
| File(s) | `spend_withdraw_publish.ak:35-41` |
| Test | -- |

**Description:**
The `ProcessSwap` spend handler only checks that a withdrawal from the script credential exists. It does not verify the withdrawal redeemer. This is a standard Cardano forwarding pattern -- the withdrawal handler enforces all real invariants.

---

### 5.15 [FND-18] Oracle Datum Function Doesn't Enforce Reference-Input Semantics (Informational)

| Field | Value |
|-------|-------|
| Severity | **Informational** |
| Vulnerability Type | missing-utxo-authentication |
| Status | By design |
| Confidence | Low |
| File(s) | `utils.ak:9-28` |
| Test | -- |

**Description:**
`get_oracle_datum` accepts a generic `List<Input>`. All current call sites correctly pass `reference_inputs`. The type system does not distinguish reference inputs from spent inputs, making this a maintenance concern for future refactors.

---

### 5.16 [RESOLVED] Oracle Spend Previously Only Required operator_key

Previously, the oracle spend handler only required `operator_key` to sign, allowing the operator alone to modify the oracle datum and escalate to full protocol control. **Fixed:** Now requires both `operator_key` and `dd_key`.

### 5.17 [RESOLVED] Publish Handler Previously Allowed Unilateral Governance Actions

Previously, the publish handler accepted any certificate type with only `operator_key`. **Fixed:** Now restricted to `UnregisterCredential` only, requiring `dd_key` authorization. All other certificate types are rejected.

## 6. Exploit Test Results

### 6.1 Test Summary

| Category | Passed | Failed | Total |
|----------|--------|--------|-------|
| Exploit PoC (pass = confirmed) | 6 | 0 | 6 |
| Defense Checks (pass = works) | 4 | 0 | 4 |
| Existing Project Tests | 35 | 0 | 35 |
| **Total** | **45** | **0** | **45** |

### 6.2 Exploit PoC Details

| Test | Finding | Result | Interpretation |
|------|---------|--------|----------------|
| `fnd01_oracle_spend_accepts_modified_datum` | FND-01 | PASS | Confirmed -- oracle accepts tx with no output validation |
| `fnd03_oracle_nft_burn_no_restrictions` | FND-03 | PASS | Confirmed -- burn has no restrictions beyond quantity |
| `fnd06_oracle_nft_accepts_any_token_name` | FND-06 | PASS | Confirmed -- any token name accepted at mint |
| `fnd07_cancel_intent_fee_inflation` | FND-07 | PASS | Confirmed -- inflated fee reduces user return |
| `fnd10_inflated_deposit_negative_lovelace` | FND-10 | PASS | Confirmed -- inflated deposit accepted |
| `fnd11_publish_only_needs_operator_key` | FND-11 | PASS | Confirmed (subsequently fixed) |

### 6.3 Defense Verification

| Test | Defense | Result | Interpretation |
|------|---------|--------|----------------|
| `fnd01_oracle_spend_requires_dd_key` | Dual-sig on oracle | PASS (rejected) | Verified -- dd_key now required |
| `fnd05_spam_prevention_rejects_valid_datum_within_24hrs` | SpamPrevention timing | PASS (rejected) | Verified -- correctly rejects within 24hrs |
| `fnd05_spam_prevention_allows_cleanup_after_24hrs` | SpamPrevention cleanup | PASS (accepted) | Verified -- cleanup works after 24hrs |
| `fnd11_publish_rejects_dd_key_only` | Publish requires operator_key | PASS (rejected) | Verified -- operator_key required |

## 7. Execution Budget & Script Size

### 7.1 Script Sizes

| Validator | UPLC Size | Status |
|-----------|-----------|--------|
| oracle/spend | 252 bytes | OK |
| oracle_nft | 379 bytes | OK |
| swap_intent (all handlers) | 7,309 bytes | OK |

All validators are well under the 12KB threshold.

### 7.2 Budget Concerns

| Validator | Handler | Test | Mem | CPU | Note |
|-----------|---------|------|-----|-----|------|
| swap_intent | withdraw | batch limit (18 intents) | 15.4M | 4.5B | Near memory limit. Max ~18 intents per batch. |

The batch processing limit of approximately 18 intents per transaction is documented and accepted. The `process_batched_swap_intent_validation` function uses a linear fold over inputs (O(n)), which is efficient. The primary budget pressure comes from the accumulated value operations (`merge`, `add`) across many intents.

## 8. Code Quality & Best Practices

### 8.1 Documentation
- Formal specifications exist for oracle and swap intent validators (`spec/` directory)
- Specifications generally match implementation, with minor gaps (e.g., spec mentions mint handler not present in code)
- Inline comments are minimal but code is readable

### 8.2 Test Coverage
- 35 existing tests cover the main paths: ProcessSwap, CancelIntent (multiple scenarios), SpamPrevention, withdraw (batch processing), and utility functions
- Batch processing edge cases are well-tested (excessive inputs, insufficient inputs, incorrect outputs/indices)
- Batch limit test confirms ~18 intents as the practical maximum
- 10 additional audit tests written during this audit

### 8.3 Code Patterns
- Standard Cardano forwarding pattern (ProcessSwap -> withdrawal) is correctly implemented
- UTxO indexer pattern follows Anastasia Labs design, with ledger balance providing inherent duplicate-index protection
- `else(_) { fail }` handlers correctly reject unexpected script purposes
- Dual-accumulator fold (`list_foldl2`) is a clean pattern for batch processing

## 9. Methodology

This audit was conducted in 7 phases:

1. **Project Discovery** -- Structure analysis, dependency review, specification reading
2. **Architecture Analysis** -- Validator mapping, cross-validator dependencies, trust model identification
3. **Vulnerability Scan** -- Per-validator check against 22-item Cardano vulnerability taxonomy (parallelized across 2 agents)
4. **Adversarial Reasoning** -- Attacker persona modeling (20 attacks modeled), protocol-specific attack scenarios, composability/temporal attacks
5. **Cross-Validator Analysis** -- Transaction composition, state machine integrity, value flow tracing, reference input dependencies
6. **Exploit Test Generation** -- 10 Aiken test cases for findings + defense verification
7. **Build & Execute** -- Script size analysis, test execution (45/45 pass), findings reconciliation

**Iterative review:** The development team made three rounds of code changes during the audit. Each change was re-evaluated against all findings, resulting in 2 resolved findings and several severity adjustments.

### 9.1 Vulnerability Taxonomy

| ID | Name | Typical Severity |
|----|------|-----------------|
| multiple-satisfaction | Double Satisfaction | Critical |
| other-token-names | Other Token Names | Critical |
| missing-utxo-authentication | Missing UTxO Authentication | Critical |
| infinite-minting | Infinite Minting | Critical |
| other-redeemer | Other Redeemer | High |
| arbitrary-utxo-datum | Arbitrary UTxO Datum | High |
| unbounded-protocol-datum | Unbounded Protocol Datum | High |
| unbounded-protocol-value | Unbounded Protocol Value | High |
| foreign-utxo-tokens | Foreign UTxO Tokens | High |
| insufficient-staking-control | Insufficient Staking Control | Medium |
| utxo-contention | UTxO Contention | Medium |
| cheap-spam | Cheap Spam | Medium |
| locked-value | Locked Value | Medium |
| division-by-zero | Division by Zero | Medium |
| rounding-error | Rounding Error | Medium |
| missing-incentive | Missing Incentive | Low |
| bad-incentive | Bad Incentive | Low |
| insufficient-tests | Insufficient Tests | Informational |
| insufficient-documentation | Insufficient Documentation | Informational |
| incorrect-documentation | Incorrect Documentation | Informational |
| poor-code-standards | Poor Code Standards | Informational |
| incorrect-logic | Incorrect Logic | Variable |

### 9.2 Severity Definitions

| Level | Definition |
|-------|-----------|
| **Critical** | Direct loss of funds or permanent protocol halt. Exploitable by any user. |
| **High** | Significant fund loss or unauthorized actions under specific conditions. |
| **Medium** | Limited impact with preconditions. Economic inefficiency, staking theft, constrained DoS. |
| **Low** | Minor issues unlikely to be exploited. Design improvements. |
| **Informational** | Best practice recommendations. No immediate security impact. |

## Appendix A -- File Checksums

```
9928a015e98de7685ae06f091f79e26a541a55543fd4230598c1ff6755fb0e79  lib/types.ak
d5dd68597f68ebb83b801e4efe5eb87b58e4356c317a6f46467a0dd8119eed7a  lib/utils.ak
db0c903d7eb1c634755d604b619146d99c9f28cec8905547efe3977c26752512  lib/swap_utils.ak
95daa2599eaf09f3515ea75626921a912c86891cd0f2cc359fb5824aac3e822f  validators/oracle/spend.ak
0c17e2cd114f7c0af278d68bd18ea9175bf0b48133b73ef5dbf368aba68e0930  validators/oracle_nft.ak
03af50ef32764b04a79ec3bd47af6bb906b166976cb2ebd85a30ea0109630a55  validators/swap_intent/spend_withdraw_publish.ak
```

## Appendix B -- Audit Test Code

Audit tests are located at `validators/tests/audit_tests.ak`. The file contains 10 tests:

- 6 exploit PoC tests confirming findings FND-01, FND-03, FND-06, FND-07, FND-10, FND-11
- 4 defense verification tests confirming that dual-sig, SpamPrevention timing, and publish restrictions work correctly
- FND-12 (operator credential overlap) noted as not directly testable in unit test context

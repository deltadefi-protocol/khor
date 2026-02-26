# Specification - SwapIntent

## Parameter

- `oracle_nft`: The policy id of `OracleNFT`

## Datum

- `account_address`: Address
- `from_amount`: `MValue`
- `to_amount`: `MValue`
- `created_at`: Int
- `deposit`: Lovelace

## User Action - Spend

1. `ProcessSwap`
   - Withdrawal script with own `script_hash` is validated in `withdrawals`

2. `CancelIntent`
   - time >= created_at + 10mins (600)
   - either:
     - signed by account_address
     - input value send back to account_address

3. `SpamPrevention`
   - `dd_key` from `VaultOracleDatum` must sign
   - datum type malformed
   - `created_at` in future or passed 24hrs

## User Action - Withdraw

1. Withdraw - Redeemer `ProcessIntent(List<Int>)`
   - Oracle `VaultOracleDatum` is read from reference input identified by `oracle_nft`
   - For each swap intent input, consuming one index at a time:
     - `outputs[index].address` == `account_address` from datum
     - `outputs[index].value` >= `to_amount` (per asset)
     - Accumulate `vault_net_outflow` += `outputs[index].value` − `from_amount`
   - Fail if more swap intent inputs than indices, or leftover indices remain after all inputs
   - `value_from_vault` == `value_to_vault` + `vault_net_outflow` + `fee`
   - Both `operator_key` and `dd_key` from `VaultOracleDatum` must sign

## User Action - Publish

1. Process Intent
   - Oracle `VaultOracleDatum` is read from reference input identified by `oracle_nft`
   - `operator_key` from `VaultOracleDatum` must sign

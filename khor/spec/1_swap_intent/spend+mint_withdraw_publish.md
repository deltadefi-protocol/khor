# Specification - SwapIntent

## Parameter

- `oracle_nft`: The policy id of `OracleNFT`

## Datum

- `account_address`: Address
- `from_amount`: `MValue`
- `to_amount`: `MValue`

## User Action - Spend

1. Process Intent
   - Withdrawal script with own `script_hash` is validated in `withdrawals`

## User Action - Mint

1. Mint - Redeemer `MintIntent`
   - Exactly 1 intent token is minted under own `policy_id` with asset name `""`
   - Exactly 1 output at own script address carrying own `policy_id`
   - That output's value is exactly `from_asset_list(from_amount) + 1 intent_token`
   - That output carries an inline `SwapIntentDatum`

2. Burn - Redeemer `BurnIntent`
   - Withdrawal script with own `policy_id` is validated in `withdrawals`

## User Action - Withdraw

1. Withdraw - Redeemer `ProcessIntent(List<Int>)`
   - Oracle `VaultOracleDatum` is read from reference input identified by `oracle_nft`
   - For each swap intent input, consuming one index at a time:
     - `outputs[index].address` == `account_address` from datum
     - `outputs[index].value` >= `to_amount` (per asset)
     - Accumulate `vault_change` += `outputs[index].value` − `from_amount`
   - Fail if more swap intent inputs than indices, or leftover indices remain after all inputs
   - Intent tokens burned == `−length(indices)`
   - `value_from_vault` == `value_to_vault` + `total_vault_change`
   - Both `operator_key` and `dd_key` from `VaultOracleDatum` must sign

## User Action - Publish

1. Process Intent
   - Oracle `VaultOracleDatum` is read from reference input identified by `oracle_nft`
   - `operator_key` from `VaultOracleDatum` must sign

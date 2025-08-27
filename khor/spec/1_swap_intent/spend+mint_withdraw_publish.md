# Specification - SwapIntent

## Parameter

- `oracle_nft`: The policy id of `OracleNFT`

## Datum

- `account_address`: Address
- `from_amount`: `MValue`
- `to_amount`: `MValue`

## User Action - Spend

1. Process Intent

   - Withdrawal Script own script_hash is validated

## User Action - Mint

1. Mint - Redeemer `RMint`

   - The net swap value sent to `SwapIntent` address is equal to the datum value of `SwapIntent`

2. Burn - Redeemer `RBurn (List<Int>, ByteArray, List<ByteArray>)`

   - Withdrawal Script own policy_id is validated

## User Action - Withdraw

1. Withdraw - Redeemer `ProcessIntent(List<Int>)`

   - `SwapIntent` is burnt with total batched amount
   - `SwapIntent` input datum is correspond to user output amount
   - `SwapIntent` input datum is correspond to vault
   - `vault` change = `vault` input - batched swaped amount, output back to `vault` address
   - oracle input with datum
   - verify signatures and keys

## User Action - Publish

1. Process Intent

   - Operator's key is signed

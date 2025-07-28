# Specification - SwapIntent

## Parameter

- `oracle_nft`: The policy id of `OracleNFT`

## Datum

- `account_address`: Address
- `amount`: `MValue` - marking the swap value
- `swap_pair`: (PolicyId, AssetName)

## User Action

1. Process Intent

   - `SwapIntent` is burnt

## User Action

1. Mint - Redeemer `RMint`

   - The net swap value sent to `SwapIntent` address is equal to the datum value of `SwapIntent`

2. Burn - Redeemer `RBurn (List<Int>, ByteArray, List<ByteArray>)`

   - `SwapIntent` is burnt with total batched amount
   - `SwapIntent` input datum is correspond to user output amount
   - `SwapIntent` input datum is correspond to vault
   - `vault` change = `vault` input - batched swaped amount, output back to `vault` address
   - output fee to `operator`
   - oracle input with datum
   - verify signatures and keys

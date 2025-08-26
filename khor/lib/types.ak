use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address}
use cardano/assets.{AssetName, PolicyId}

// Mint Redeemer

pub type MintPolarity {
  RMint
  RBurn
}

// 0 - VaultOracle

pub type VaultOracleDatum {
  vault_script_hash: ByteArray,
  swap_intent_script_hash: ByteArray,
  operator_key: VerificationKeyHash,
  swap_charge: Int,
  dd_key: VerificationKeyHash,
}

// 1 - SwapIntent
pub type SwapIntentDatum {
  account_address: Address,
  from_amount: MValue,
  to_amount: MValue,
}

pub type IntentRedeemer {
  MintIntent
  BurnIntent
}

pub type SwapIntentWithdrawRedeemer {
  ProcessIntent(List<Int>)
}

pub type MValue =
  Pairs<PolicyId, Pairs<AssetName, Int>>

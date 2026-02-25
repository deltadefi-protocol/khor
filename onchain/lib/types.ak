use aiken/crypto.{VerificationKeyHash}
use cardano/address.{Address, Credential}
use cardano/assets.{AssetName, Lovelace, PolicyId}

// Mint Redeemer

pub type MintPolarity {
  RMint
  RBurn
}

// 0 - VaultOracle

pub type VaultOracleDatum {
  vault_script_hash: Credential,
  swap_intent_script_hash: ByteArray,
  operator_key: VerificationKeyHash,
  dd_key: VerificationKeyHash,
}

// 1 - SwapIntent
pub type SwapIntentDatum {
  account_address: Address,
  from_amount: MValue,
  to_amount: MValue,
  created_at: Int,
  deposit: Lovelace,
}

pub type IntentRedeemer {
  MintIntent
  BurnIntent
  CancelIntent
}

pub type SwapIntentWithdrawRedeemer {
  ProcessIntent(List<Int>)
}

pub type MValue =
  Pairs<PolicyId, Pairs<AssetName, Int>>

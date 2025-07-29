use aiken/crypto.{ScriptHash, VerificationKey, VerificationKeyHash}
use cardano/address.{Address}
use cardano/assets.{AssetName, PolicyId}

// Mint Redeemer

pub type MintPolarity {
  RMint
  RBurn
}

// AppOracle

pub type WithdrawalScriptHashes {
  app_deposit: ScriptHash,
  app_withdrawal: ScriptHash,
  emergency_cancel_order: ScriptHash,
}

pub type AppOracleDatum {
  operation_key: VerificationKeyHash,
  stop_key: VerificationKeyHash,
  oracle_nft: PolicyId,
  oracle_address: Address,
  app_vault_address: Address,
  app_deposit_request_token: PolicyId,
  app_deposit_request_address: Address,
  dex_account_balance_token: PolicyId,
  dex_account_balance_address: Address,
  dex_order_book_token: PolicyId,
  dex_order_book_address: Address,
  emergency_cancel_order_request_token: PolicyId,
  emergency_cancel_order_request_address: Address,
  emergency_withdrawal_request_token: PolicyId,
  emergency_withdrawal_request_address: Address,
  all_withdrawal_script_hashes: WithdrawalScriptHashes,
  hydra_info: HydraInfo,
}

pub type HydraInfo {
  hydra_initial_hash: ScriptHash,
  hydra_signers: List<VerificationKeyHash>,
}

// 0 - VaultOracle

pub type VaultOracleDatum {
  app_oracle: PolicyId,
  node_pub_key: List<VerificationKey>,
  vault_script_hash: ByteArray,
  swap_intent_script_hash: ByteArray,
  operator_key: VerificationKeyHash,
  swap_charge: Int,
}

// 1 - SwapIntent
pub type SwapIntentDatum {
  account_address: Address,
  amount: MValue,
  swap_pair: (PolicyId, AssetName),
}

pub type IntentRedeemer {
  MintIntent
  BurnIntent(List<Int>, ByteArray, List<ByteArray>)
}

pub type MValue =
  Pairs<PolicyId, Pairs<AssetName, Int>>

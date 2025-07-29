use aiken/cbor
use aiken/crypto.{blake2b_224}
use cardano/address.{from_script}
use cardano/assets.{Value}
use mocktail.{
  mock_policy_id, mock_pub_key_address, mock_pub_key_hash, mock_script_address,
  mock_script_hash,
}
use types.{
  AppOracleDatum, BurnIntent, HydraInfo, MValue, SwapIntentDatum,
  VaultOracleDatum, WithdrawalScriptHashes,
}

pub const mock_operation_key = mock_pub_key_hash(0)

pub const mock_stop_key = mock_pub_key_hash(1)

pub const mock_app_oracle = mock_policy_id(0)

pub const mock_app_swap_request_token = mock_policy_id(1)

pub const mock_emergency_withdrawal_request_token = mock_policy_id(100)

pub const mock_dex_account_balance_token = mock_policy_id(3)

pub const mock_dex_order_book_token = mock_policy_id(4)

pub const mock_emergency_cancel_order_request_token = mock_policy_id(400)

pub const mock_app_oracle_address = from_script("app_oracle_address")

pub const mock_app_vault_address = from_script("app_vault_address")

pub const mock_app_swap_request_address =
  from_script("app_swap_request_address")

pub const mock_emergency_withdrawal_request_address =
  from_script("emergency_withdrawal_request_address")

pub const mock_dex_account_balance_address =
  from_script("dex_account_balance_address")

pub const mock_dex_order_book_address = from_script("dex_order_book_address")

pub const mock_emergency_cancel_order_request_address =
  from_script("emergency_cancel_order_request_address")

pub const mock_app_swap = mock_script_hash(0)

pub const mock_app_withdrawal = mock_script_hash(1)

pub const mock_emergency_cancel_order = mock_script_hash(700)

pub const mock_withdrawal_script_hashes: WithdrawalScriptHashes =
  WithdrawalScriptHashes {
    app_deposit: mock_app_swap,
    app_withdrawal: mock_app_withdrawal,
    emergency_cancel_order: mock_emergency_cancel_order,
  }

pub const mock_hydra_initial_hash = mock_script_hash(999)

pub const mock_hydra_script_address = mock_script_address(999, None)

pub const mock_hydra_signer_1 =
  blake2b_224(
    #"8a2447b9e7f1705aa5b2dcb16a7254db089fbac7e462cf6008e9a6dc8a7a6c21",
  )

pub const mock_hydra_signer_2 =
  blake2b_224(
    #"312803d57366263f9e5310262fb9984f58dbc5602ad5ebdd5725719f4f913ced",
  )

pub const mock_hydra_signer_3 =
  blake2b_224(
    #"fa357c31b2e47f49d4e0da6eac605a4dc068f4e72fbc56bfef2850e2da1ba3a3",
  )

pub const mock_hydra_signers =
  [mock_hydra_signer_1, mock_hydra_signer_2, mock_hydra_signer_3]

pub const mock_input_oracle_datum: AppOracleDatum =
  AppOracleDatum {
    operation_key: mock_operation_key,
    stop_key: mock_stop_key,
    oracle_nft: mock_app_oracle,
    oracle_address: mock_app_oracle_address,
    app_vault_address: mock_app_vault_address,
    app_deposit_request_token: mock_app_swap_request_token,
    app_deposit_request_address: mock_app_swap_request_address,
    dex_account_balance_token: mock_dex_account_balance_token,
    dex_account_balance_address: mock_dex_account_balance_address,
    dex_order_book_token: mock_dex_order_book_token,
    dex_order_book_address: mock_dex_order_book_address,
    emergency_cancel_order_request_token: mock_emergency_cancel_order_request_token,
    emergency_cancel_order_request_address: mock_emergency_cancel_order_request_address,
    emergency_withdrawal_request_token: mock_emergency_withdrawal_request_token,
    emergency_withdrawal_request_address: mock_emergency_withdrawal_request_address,
    all_withdrawal_script_hashes: mock_withdrawal_script_hashes,
    hydra_info: HydraInfo {
      hydra_initial_hash: mock_hydra_initial_hash,
      hydra_signers: mock_hydra_signers,
    },
  }

pub const mock_vault_oracle = mock_policy_id(10)

pub const mock_vault_oracle_address = from_script("vault_oracle_address")

pub const mock_pluggable_logic = mock_script_hash(10)

pub const mock_node_pub_keys =
  [
    #"8a2447b9e7f1705aa5b2dcb16a7254db089fbac7e462cf6008e9a6dc8a7a6c21",
    #"312803d57366263f9e5310262fb9984f58dbc5602ad5ebdd5725719f4f913ced",
    #"fa357c31b2e47f49d4e0da6eac605a4dc068f4e72fbc56bfef2850e2da1ba3a3",
  ]

pub const mock_swap_charge = 50

pub const mock_operator_key = mock_pub_key_hash(10)

pub const mock_vault_script_hash = mock_script_hash(10)

pub const mock_swap_intent_script_hash = mock_script_hash(11)

pub const mock_vault_oracle_datum: VaultOracleDatum =
  VaultOracleDatum {
    app_oracle: mock_app_oracle,
    node_pub_key: mock_node_pub_keys,
    vault_script_hash: mock_vault_script_hash,
    swap_intent_script_hash: mock_swap_intent_script_hash,
    operator_key: mock_operator_key,
    swap_charge: mock_swap_charge,
  }

pub const mock_burn_intent_redeemer = BurnIntent([0], "", [])

pub const mock_swap_m_value =
  [
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 143533706)],
    ),
  ]

pub const mock_swap_intent_datum =
  SwapIntentDatum {
    account_address: mock_pub_key_address(0, None),
    amount: mock_swap_m_value,
    swap_pair: (
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      #"5553444d",
    ),
  }

pub fn to_mvalue(value: Value) -> MValue {
  let data = cbor.serialise(value)
  expect Some(mvalue_raw): Option<Data> = cbor.deserialise(data)
  expect mvalue: MValue = mvalue_raw
  mvalue
}

pub const mock_message =
  #"d8799f1ad9133796a25820c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c9135553444d014002d8799f5820cd82a190d3b4ef95a50bd791882959f541e308adb69b12d022d94a6d9f02bcf000ffff"

pub const mock_signatures =
  [
    #"08e454f591121b1a09fd0073fdf66740bad3f1382dcfc499e91a996f601c7c8909e4b0a0b8fe64e68514f315ffdd02944c369ef2a9ce22a3dec14b60b0109e0d",
    #"f98d0e8aab34dc74d633df4310d8bf49809627d4bd4ef0ee8fa3b3ba47deb9e804de031e015521359c1d69070266f3d4423a07994f424782ceeaa8413739160c",
    #"4d2a670fed48e57b7c2d4d582afd5f24378a2b93c3794dce409c15fe59b417c08ba8b598f8e9b6ffd68374f5eac79a7588cc218d4d58251b3992db10d01e100a",
  ]

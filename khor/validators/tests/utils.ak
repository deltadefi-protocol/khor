use aiken/cbor
use cardano/address.{from_script}
use cardano/assets.{Value}
use mocktail.{
  mock_policy_id, mock_pub_key_address, mock_pub_key_hash, mock_script_hash,
}
use types.{BurnIntent, MValue, SwapIntentDatum, VaultOracleDatum}

pub const mock_vault_oracle = mock_policy_id(10)

pub const mock_vault_oracle_address = from_script("vault_oracle_address")

pub const mock_swap_charge = 50

pub const mock_operator_key = mock_pub_key_hash(10)

pub const mock_vault_script_hash = mock_script_hash(10)

pub const mock_swap_intent_script_hash = mock_script_hash(11)

pub const mock_vault_oracle_datum: VaultOracleDatum =
  VaultOracleDatum {
    vault_script_hash: mock_vault_script_hash,
    swap_intent_script_hash: mock_swap_intent_script_hash,
    operator_key: mock_operator_key,
    swap_charge: mock_swap_charge,
  }

pub const mock_burn_intent_redeemer = BurnIntent([0])

pub const mock_swap_from_m_value =
  [
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 1000000)],
    ),
  ]

pub const mock_swap_to_m_value = [Pair(#"", [Pair(#"", 1000000)])]

pub const mock_swap_intent_datum =
  SwapIntentDatum {
    account_address: mock_pub_key_address(0, None),
    from_amount: mock_swap_from_m_value,
    to_amount: mock_swap_to_m_value,
  }

pub fn to_mvalue(value: Value) -> MValue {
  let data = cbor.serialise(value)
  expect Some(mvalue_raw): Option<Data> = cbor.deserialise(data)
  expect mvalue: MValue = mvalue_raw
  mvalue
}

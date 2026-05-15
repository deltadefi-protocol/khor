use aiken/cbor
use cardano/address.{Address, Inline, Script, VerificationKey}
use cardano/assets.{add, from_asset, from_asset_list, from_lovelace, merge}
use cardano/transaction.{InlineDatum, Input, NoDatum, Transaction}
use mocktail.{
  add_extra_signatory, add_input, add_output, complete, mock_output,
  mock_tx_hash, mock_utxo_ref, mocktail_tx, ref_tx_in, ref_tx_in_inline_datum,
  set_fee,
}
use swap_intent/spend_withdraw_publish as swap_intent_spend_mint_withdraw_publish
use tests/swap_utils/process_batch.{
  intent_input_a, intent_input_b, intent_input_c, intent_output_a,
  intent_output_b, intent_output_c, intent_output_value_a, intent_output_value_b,
  intent_output_value_c, m_value_a_from, m_value_b_from, m_value_c_from,
}
use tests/utils.{
  mock_dd_key, mock_operator_cred, mock_operator_key, mock_swap_script_hash,
  mock_vault_oracle, mock_vault_oracle_address, mock_vault_oracle_datum,
}
use types.{ProcessIntent, SwapIntentDatum}

const indices = [0, 1, 2]

type WithdrawSwapIntentTestCase {
  is_vault_oracle_inputed: Bool,
  is_signed: Bool,
  is_value_unlock_from_vault_correct: Bool,
}

fn mock_withdraw_swap_intent_tx(
  test_case: WithdrawSwapIntentTestCase,
) -> Transaction {
  let WithdrawSwapIntentTestCase {
    is_vault_oracle_inputed,
    is_signed,
    is_value_unlock_from_vault_correct,
  } = test_case
  let vault_oracle_input_value =
    if is_vault_oracle_inputed {
      from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000)
    } else {
      from_asset("", "", 1) |> add("", "", 1)
    }

  let vault_input_a =
    Input {
      output_reference: mock_utxo_ref(10, 0),
      output: mock_output(
        Address {
          payment_credential: mock_operator_cred,
          stake_credential: None,
        },
        intent_output_value_a
          |> add("", "", -1500000)
          |> merge(intent_output_value_b |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000)),
        NoDatum,
        None,
      ),
    }

  let vault_output =
    if is_value_unlock_from_vault_correct {
      mock_output(
        Address {
          payment_credential: mock_operator_cred,
          stake_credential: None,
        },
        from_asset_list(m_value_a_from)
          |> merge(from_asset_list(m_value_b_from))
          |> merge(from_asset_list(m_value_c_from)),
        NoDatum,
        None,
      )
    } else {
      mock_output(
        Address {
          payment_credential: mock_operator_cred,
          stake_credential: None,
        },
        from_asset_list(m_value_a_from)
          |> merge(from_asset_list(m_value_c_from))
          |> merge(from_asset_list(m_value_c_from)),
        NoDatum,
        None,
      )
    }

  mocktail_tx()
    |> ref_tx_in(
        True,
        mock_tx_hash(0),
        0,
        vault_oracle_input_value,
        mock_vault_oracle_address,
      )
    |> ref_tx_in_inline_datum(is_vault_oracle_inputed, mock_vault_oracle_datum)
    |> complete()
    |> add_input(True, intent_input_a)
    |> add_input(True, intent_input_b)
    |> add_input(True, intent_input_c)
    |> add_input(True, vault_input_a)
    |> add_output(True, intent_output_a)
    |> add_output(True, intent_output_b)
    |> add_output(True, intent_output_c)
    |> add_output(True, vault_output)
    |> add_extra_signatory(True, mock_operator_key)
    |> add_extra_signatory(is_signed, mock_dd_key)
}

test s1_mint_success_burn_swap_intent() {
  let redeemer = ProcessIntent(indices)
  let tx =
    mock_withdraw_swap_intent_tx(
      WithdrawSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_signed: True,
        is_value_unlock_from_vault_correct: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_script_hash),
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_no_vault_oracle_input() fail {
  let redeemer = ProcessIntent(indices)
  let tx =
    mock_withdraw_swap_intent_tx(
      WithdrawSwapIntentTestCase {
        is_vault_oracle_inputed: False,
        is_signed: True,
        is_value_unlock_from_vault_correct: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_script_hash),
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_unsigned() {
  let redeemer = ProcessIntent(indices)
  let tx =
    mock_withdraw_swap_intent_tx(
      WithdrawSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_signed: False,
        is_value_unlock_from_vault_correct: True,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_script_hash),
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_incorrect_value_unlock_from_vault() {
  let redeemer = ProcessIntent(indices)
  let tx =
    mock_withdraw_swap_intent_tx(
      WithdrawSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_signed: True,
        is_value_unlock_from_vault_correct: False,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_script_hash),
    tx,
  )
}

test ggggg() {
  let data =
    #"d8799fd8799fd8799f581c0393870e716e0c63537e5521dc851499cb2cf49579fc09f500eb0c65ffd8799fd8799fd8799f581c3ccab0e0903affe02f74483181e880a00343e820c8a7d28b20df203dffffffffa140a1401a02faf080a1581c1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34a14555534443781a00baa3191a0b089b411a001e8480ff"

  expect Some(swap) = cbor.deserialise(data)
  expect s: SwapIntentDatum = swap
  s.deposit == 2000000
}

// ------------------------------------------------------------------
// Mirror of failing on-chain tx: single intent ADA→USDM, vault holds
// 4 assets (ADA + NIGHT + USDCx + USDM). See Untitled-1.json.
// ------------------------------------------------------------------

const real_user_payment_vkh =
  #"858948afbf93363eb416d7a75fffc9a509dce7c72495b28d4944918e"

const real_user_stake_vkh =
  #"22b0980e9a46c33d97183ade671240b41ba68538ace6d9d93f649a7e"

const real_user_address =
  Address {
    payment_credential: VerificationKey(real_user_payment_vkh),
    stake_credential: Some(Inline(VerificationKey(real_user_stake_vkh))),
  }

const usdm_policy = #"c48cbb3d5e57ed56e276bc45f99ab39abe94e6cd7ac39fb402da47ad"

const usdm_asset = #"0014df105553444d"

const night_policy = #"0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa"

const night_asset = #"4e49474854"

const usdcx_policy = #"1f3aec8bfe7ea4fe14c5f121e2a92e301afe414147860d557cac7e34"

const usdcx_asset = #"5553444378"

const real_intent_datum: Data =
  SwapIntentDatum {
    account_address: real_user_address,
    from_amount: [Pair("", [Pair("", 80_000_000)])],
    to_amount: [Pair(usdm_policy, [Pair(usdm_asset, 21_040_727)])],
    created_at: 187_261_445,
    deposit: 2_000_000,
  }

const real_intent_input =
  Input {
    output_reference: mock_utxo_ref(100, 0),
    output: mock_output(
      Address {
        payment_credential: Script(mock_swap_script_hash),
        stake_credential: None,
      },
      from_lovelace(82_000_000),
      InlineDatum(real_intent_datum),
      None,
    ),
  }

const real_intent_output =
  mock_output(
    real_user_address,
    from_lovelace(2_000_000) |> add(usdm_policy, usdm_asset, 21_040_727),
    NoDatum,
    None,
  )

const real_vault_in_value =
  from_lovelace(15_000_000_000)
    |> add(night_policy, night_asset, 30_000_000_000)
    |> add(usdcx_policy, usdcx_asset, 2_480_996_384)
    |> add(usdm_policy, usdm_asset, 2_487_177_184)

const real_vault_out_value =
  from_lovelace(15_076_985_451)
    |> add(night_policy, night_asset, 30_000_000_000)
    |> add(usdcx_policy, usdcx_asset, 2_480_996_384)
    |> add(usdm_policy, usdm_asset, 2_466_136_457)

const real_vault_address =
  Address { payment_credential: mock_operator_cred, stake_credential: None }

const real_vault_input =
  Input {
    output_reference: mock_utxo_ref(101, 0),
    output: mock_output(real_vault_address, real_vault_in_value, NoDatum, None),
  }

const real_vault_output =
  mock_output(real_vault_address, real_vault_out_value, NoDatum, None)

fn mirror_tx() -> Transaction {
  mocktail_tx()
    |> ref_tx_in(
        True,
        mock_tx_hash(0),
        0,
        from_asset(mock_vault_oracle, "", 1)
          |> add("", "", 2_000_000),
        mock_vault_oracle_address,
      )
    |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
    |> complete()
    |> set_fee(True, 3_014_549)
    |> add_input(True, real_intent_input)
    |> add_input(True, real_vault_input)
    |> add_output(True, real_intent_output)
    |> add_output(True, real_vault_output)
    |> add_extra_signatory(True, mock_operator_key)
    |> add_extra_signatory(True, mock_dd_key)
}

test mirror_failing_onchain_tx() {
  let redeemer = ProcessIntent([0])
  swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_script_hash),
    mirror_tx(),
  )
}

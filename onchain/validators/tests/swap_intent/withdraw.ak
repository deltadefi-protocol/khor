use cardano/address.{Address, Script}
use cardano/assets.{add, from_asset, from_asset_list, merge}
use cardano/transaction.{Input, NoDatum, Transaction}
use mocktail.{
  add_extra_signatory, add_input, add_output, complete, mint, mock_output,
  mock_tx_hash, mock_utxo_ref, mocktail_tx, ref_tx_in, ref_tx_in_inline_datum,
}
use swap_intent/spend_mint_withdraw_publish as swap_intent_spend_mint_withdraw_publish
use tests/swap_utils/process_batch.{
  intent_input_a, intent_input_b, intent_input_c, intent_output_a,
  intent_output_b, intent_output_c, intent_output_value_a, intent_output_value_b,
  intent_output_value_c, m_value_a_from, m_value_b_from, m_value_c_from,
}
use tests/utils.{
  mock_dd_key, mock_operator_cred, mock_operator_key,
  mock_swap_intent_script_hash, mock_vault_oracle, mock_vault_oracle_address,
  mock_vault_oracle_datum,
}
use types.{ProcessIntent}

const indices = [0, 1, 2]

type WithdrawSwapIntentTestCase {
  is_vault_oracle_inputed: Bool,
  is_intent_burn_amount_correct: Bool,
  is_signed: Bool,
  is_value_unlock_from_vault_correct: Bool,
}

fn mock_withdraw_swap_intent_tx(
  test_case: WithdrawSwapIntentTestCase,
) -> Transaction {
  let WithdrawSwapIntentTestCase {
    is_vault_oracle_inputed,
    is_intent_burn_amount_correct,
    is_signed,
    is_value_unlock_from_vault_correct,
  } = test_case
  let vault_oracle_input_value =
    if is_vault_oracle_inputed {
      from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000)
    } else {
      from_asset("", "", 1) |> add("", "", 1)
    }

  let intent_burn_amount =
    if is_intent_burn_amount_correct {
      3
    } else {
      3 + 1
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
    |> mint(True, -intent_burn_amount, mock_swap_intent_script_hash, "")
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
        is_intent_burn_amount_correct: True,
        is_signed: True,
        is_value_unlock_from_vault_correct: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_intent_script_hash),
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_no_vault_oracle_input() fail {
  let redeemer = ProcessIntent(indices)
  let tx =
    mock_withdraw_swap_intent_tx(
      WithdrawSwapIntentTestCase {
        is_vault_oracle_inputed: False,
        is_intent_burn_amount_correct: True,
        is_signed: True,
        is_value_unlock_from_vault_correct: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_intent_script_hash),
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_incorrect_intent_burn_amount() {
  let redeemer = ProcessIntent(indices)
  let tx =
    mock_withdraw_swap_intent_tx(
      WithdrawSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_intent_burn_amount_correct: False,
        is_signed: True,
        is_value_unlock_from_vault_correct: True,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_intent_script_hash),
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_unsigned() {
  let redeemer = ProcessIntent(indices)
  let tx =
    mock_withdraw_swap_intent_tx(
      WithdrawSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_intent_burn_amount_correct: True,
        is_signed: False,
        is_value_unlock_from_vault_correct: True,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_intent_script_hash),
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_incorrect_value_unlock_from_vault() {
  let redeemer = ProcessIntent(indices)
  let tx =
    mock_withdraw_swap_intent_tx(
      WithdrawSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_intent_burn_amount_correct: True,
        is_signed: True,
        is_value_unlock_from_vault_correct: False,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_intent_script_hash),
    tx,
  )
}

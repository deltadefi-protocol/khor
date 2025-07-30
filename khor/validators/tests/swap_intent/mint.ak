use cardano/address.{from_script}
use cardano/assets.{add, from_asset, from_asset_list, merge}
use cardano/transaction.{Input, NoDatum, Transaction}
use mocktail.{
  add_extra_signatory, add_input, add_output, complete, mint, mock_policy_id,
  mock_tx_hash, mock_utxo_ref, mocktail_tx, ref_tx_in, ref_tx_in_inline_datum,
  tx_out, tx_out_inline_datum,
}
use mocktail/virgin_outputs.{mock_output}
use swap_intent/spend_and_mint as swap_intent_spend_and_mint
use tests/swap_utils/process_batch.{
  intent_input_a, intent_input_b, intent_input_c, intent_output_a,
  intent_output_b, intent_output_c, intent_output_value_a, intent_output_value_b,
  intent_output_value_c, m_value_a_from, m_value_b_from, m_value_c_from,
}
use tests/utils.{
  mock_dd_key, mock_operator_key, mock_swap_from_m_value, mock_swap_intent_datum,
  mock_swap_intent_script_hash, mock_vault_oracle, mock_vault_oracle_address,
  mock_vault_oracle_datum, mock_vault_script_hash, to_mvalue,
}
use types.{BurnIntent, MValue, MintIntent}

type MintDepositIntentTestCase {
  is_swap_intent_minted: Bool,
  is_token_output_clean: Bool,
  is_value_locked_correctly: Bool,
}

fn mock_mint_swap_intent_tx(test_case: MintDepositIntentTestCase) -> Transaction {
  let MintDepositIntentTestCase {
    is_swap_intent_minted,
    is_token_output_clean,
    is_value_locked_correctly,
  } = test_case

  let swap_value: MValue =
    if is_value_locked_correctly {
      mock_swap_from_m_value
    } else {
      from_asset("A", "abc", 1)
        |> add("C", "def", 10)
        |> to_mvalue()
    }
  let output_datum = mock_swap_intent_datum
  mocktail_tx()
    |> mint(is_swap_intent_minted, 1, mock_swap_intent_script_hash, "")
    |> tx_out(
        is_token_output_clean,
        from_script(mock_swap_intent_script_hash),
        from_asset_list(swap_value)
          |> add(mock_swap_intent_script_hash, "", 1),
      )
    |> tx_out(
        !is_token_output_clean,
        from_script(mock_swap_intent_script_hash),
        from_asset_list(swap_value)
          |> add(mock_swap_intent_script_hash, "", 1)
          |> add(mock_policy_id(999), "", 1),
      )
    |> tx_out_inline_datum(True, output_datum)
    |> complete()
}

test s1_mint_success_mint_swap_intent() {
  let redeemer = MintIntent
  let tx =
    mock_mint_swap_intent_tx(
      MintDepositIntentTestCase {
        is_swap_intent_minted: True,
        is_token_output_clean: True,
        is_value_locked_correctly: True,
      },
    )

  swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_mint_swap_intent_with_no_intent_minted() {
  let redeemer = MintIntent
  let tx =
    mock_mint_swap_intent_tx(
      MintDepositIntentTestCase {
        is_swap_intent_minted: False,
        is_token_output_clean: True,
        is_value_locked_correctly: True,
      },
    )

  !swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_mint_swap_intent_with_intent_output_not_clean() {
  let redeemer = MintIntent
  let tx =
    mock_mint_swap_intent_tx(
      MintDepositIntentTestCase {
        is_swap_intent_minted: True,
        is_token_output_clean: False,
        is_value_locked_correctly: True,
      },
    )

  !swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_mint_swap_intent_with_value_locked_incorrect() {
  let redeemer = MintIntent
  let tx =
    mock_mint_swap_intent_tx(
      MintDepositIntentTestCase {
        is_swap_intent_minted: True,
        is_token_output_clean: True,
        is_value_locked_correctly: False,
      },
    )

  !swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

type BurnSwapIntentTestCase {
  is_vault_oracle_inputed: Bool,
  is_intent_burn_amount_correct: Bool,
  is_signed: Bool,
  is_value_unlock_from_vault_correct: Bool,
}

const indices = [0, 1, 2]

fn mock_burn_swap_intent_tx(test_case: BurnSwapIntentTestCase) -> Transaction {
  let BurnSwapIntentTestCase {
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
        from_script(mock_vault_script_hash),
        intent_output_value_a
          |> merge(intent_output_value_b)
          |> merge(intent_output_value_c),
        NoDatum,
        None,
      ),
    }

  let vault_output =
    if is_value_unlock_from_vault_correct {
      mock_output(
        from_script(mock_vault_script_hash),
        from_asset_list(m_value_a_from)
          |> merge(from_asset_list(m_value_b_from))
          |> merge(from_asset_list(m_value_c_from)),
        NoDatum,
        None,
      )
    } else {
      mock_output(
        from_script(mock_vault_script_hash),
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
  let redeemer = BurnIntent(indices)
  let tx =
    mock_burn_swap_intent_tx(
      BurnSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_intent_burn_amount_correct: True,
        is_signed: True,
        is_value_unlock_from_vault_correct: True,
      },
    )

  swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_no_vault_oracle_input() fail {
  let redeemer = BurnIntent(indices)
  let tx =
    mock_burn_swap_intent_tx(
      BurnSwapIntentTestCase {
        is_vault_oracle_inputed: False,
        is_intent_burn_amount_correct: True,
        is_signed: True,
        is_value_unlock_from_vault_correct: True,
      },
    )

  swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_incorrect_intent_burn_amount() {
  let redeemer = BurnIntent(indices)
  let tx =
    mock_burn_swap_intent_tx(
      BurnSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_intent_burn_amount_correct: False,
        is_signed: True,
        is_value_unlock_from_vault_correct: True,
      },
    )

  !swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_unsigned() {
  let redeemer = BurnIntent(indices)
  let tx =
    mock_burn_swap_intent_tx(
      BurnSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_intent_burn_amount_correct: True,
        is_signed: False,
        is_value_unlock_from_vault_correct: True,
      },
    )

  !swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_incorrect_value_unlock_from_vault() {
  let redeemer = BurnIntent(indices)
  let tx =
    mock_burn_swap_intent_tx(
      BurnSwapIntentTestCase {
        is_vault_oracle_inputed: True,
        is_intent_burn_amount_correct: True,
        is_signed: True,
        is_value_unlock_from_vault_correct: False,
      },
    )

  !swap_intent_spend_and_mint.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

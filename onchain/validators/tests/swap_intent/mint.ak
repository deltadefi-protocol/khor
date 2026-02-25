use cardano/address.{from_script}
use cardano/assets.{add, from_asset, from_asset_list}
use cardano/transaction.{InlineDatum, Input, Transaction}
use cocktail.{address_payment_key}
use mocktail.{
  add_extra_signatory, add_input, complete, invalid_before, mint, mock_output,
  mock_policy_id, mock_utxo_ref, mocktail_tx, script_withdrawal, tx_out,
  tx_out_inline_datum,
}
use swap_intent/spend_mint_withdraw_publish as swap_intent_spend_mint_withdraw_publish
use tests/utils.{
  mock_account_address, mock_created_at, mock_swap_from_m_value,
  mock_swap_intent_datum, mock_swap_intent_script_hash, mock_vault_oracle,
  to_mvalue,
}
use types.{BurnIntent, CancelIntent, MValue, MintIntent}

type MintSwapIntentTestCase {
  is_swap_intent_minted: Bool,
  is_token_output_clean: Bool,
  is_value_locked_correctly: Bool,
}

fn mock_mint_swap_intent_tx(test_case: MintSwapIntentTestCase) -> Transaction {
  let MintSwapIntentTestCase {
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
          |> add(mock_swap_intent_script_hash, "", 1)
          |> add("", "", 1500000),
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
      MintSwapIntentTestCase {
        is_swap_intent_minted: True,
        is_token_output_clean: True,
        is_value_locked_correctly: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
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
      MintSwapIntentTestCase {
        is_swap_intent_minted: False,
        is_token_output_clean: True,
        is_value_locked_correctly: True,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
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
      MintSwapIntentTestCase {
        is_swap_intent_minted: True,
        is_token_output_clean: False,
        is_value_locked_correctly: True,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
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
      MintSwapIntentTestCase {
        is_swap_intent_minted: True,
        is_token_output_clean: True,
        is_value_locked_correctly: False,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

type BurnSwapIntentTestCase {
  is_withdrawal_script_executed: Bool,
}

fn mock_burn_swap_intent_tx(test_case: BurnSwapIntentTestCase) -> Transaction {
  let BurnSwapIntentTestCase { is_withdrawal_script_executed } = test_case

  mocktail_tx()
    |> script_withdrawal(
        is_withdrawal_script_executed,
        mock_swap_intent_script_hash,
        2_000_000,
      )
    |> complete()
}

test s1_mint_success_burn_swap_intent() {
  let redeemer = BurnIntent
  let tx =
    mock_burn_swap_intent_tx(
      BurnSwapIntentTestCase { is_withdrawal_script_executed: True },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_burn_swap_intent_with_no_withdrawal_script_executed() {
  let redeemer = BurnIntent
  let tx =
    mock_burn_swap_intent_tx(
      BurnSwapIntentTestCase { is_withdrawal_script_executed: False },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

type CancelSwapIntentTestCase {
  is_swap_intent_burnt: Bool,
  is_cancel_time_valid: Bool,
  is_value_unlocked_correctly: Bool,
  is_account_signed: Bool,
}

fn mock_cancel_swap_intent_tx(
  test_case: CancelSwapIntentTestCase,
) -> Transaction {
  let CancelSwapIntentTestCase {
    is_swap_intent_burnt,
    is_cancel_time_valid,
    is_value_unlocked_correctly,
    is_account_signed,
  } = test_case

  let swap_asset =
    if is_value_unlocked_correctly {
      from_asset_list(mock_swap_from_m_value)
    } else {
      from_asset("A", "abc", 1)
        |> add("C", "def", 10)
    }
  mocktail_tx()
    |> mint(is_swap_intent_burnt, -1, mock_swap_intent_script_hash, "")
    |> tx_out(True, mock_account_address, swap_asset)
    |> invalid_before(is_cancel_time_valid, mock_created_at + 601)
    |> complete()
    |> add_extra_signatory(
        is_account_signed,
        address_payment_key(mock_account_address),
      )
    |> add_input(
        True,
        Input {
          output_reference: mock_utxo_ref(0, 0),
          output: mock_output(
            from_script(mock_swap_intent_script_hash),
            from_asset_list(mock_swap_from_m_value)
              |> add(mock_swap_intent_script_hash, "", 1),
            InlineDatum(mock_swap_intent_datum),
            None,
          ),
        },
      )
}

test s1_mint_success_cancel_swap_intent() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_swap_intent_burnt: True,
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: True,
        is_account_signed: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_cancel_swap_intent_with_no_intent_burnt() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_swap_intent_burnt: False,
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: True,
        is_account_signed: True,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_cancel_swap_intent_with_invalid_cancel_time() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_swap_intent_burnt: True,
        is_cancel_time_valid: False,
        is_value_unlocked_correctly: True,
        is_account_signed: True,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_fail_cancel_swap_intent_with_value_unlocked_incorrect_and_no_sign() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_swap_intent_burnt: True,
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: False,
        is_account_signed: False,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_success_cancel_swap_intent_with_no_account_signature_but_with_value_unlocked_correct() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_swap_intent_burnt: True,
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: True,
        is_account_signed: False,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

test s1_mint_success_cancel_swap_intent_with_value_unlocked_incorrect_but_has_sign() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_swap_intent_burnt: True,
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: False,
        is_account_signed: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.mint(
    mock_vault_oracle,
    redeemer,
    mock_swap_intent_script_hash,
    tx,
  )
}

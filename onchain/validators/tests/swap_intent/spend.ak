use cardano/address.{from_script}
use cardano/assets.{add, from_asset, from_asset_list}
use cardano/transaction.{InlineDatum, Input, Transaction}
use cocktail.{address_payment_key}
use mocktail.{
  add_extra_signatory, add_input, complete, invalid_before, invalid_hereafter,
  mock_output, mock_tx_hash, mock_utxo_ref, mocktail_tx, ref_tx_in,
  ref_tx_in_inline_datum, script_withdrawal, tx_in, tx_in_inline_datum, tx_out,
}
use swap_intent/spend_mint_withdraw_publish as swap_intent_spend_mint_withdraw_publish
use tests/utils.{
  mock_account_address, mock_created_at, mock_dd_key, mock_swap_from_m_value,
  mock_swap_intent_datum, mock_swap_script_hash, mock_vault_oracle,
  mock_vault_oracle_address, mock_vault_oracle_datum,
}
use types.{CancelIntent, ProcessSwap, SpamPrevention, SwapIntentDatum}

type ProcessSwapTestCase {
  is_withdrawal_script_executed: Bool,
}

fn mock_process_swap_tx(test_case: ProcessSwapTestCase) -> Transaction {
  let ProcessSwapTestCase { is_withdrawal_script_executed } = test_case

  let input_value =
    from_asset(mock_swap_script_hash, "", 1)
      |> add("", "", 2_000_000)

  mocktail_tx()
    |> ref_tx_in(
        True,
        mock_tx_hash(0),
        0,
        from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
        mock_vault_oracle_address,
      )
    |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
    |> tx_in(
        True,
        mock_tx_hash(0),
        0,
        input_value,
        from_script(mock_swap_script_hash),
      )
    |> tx_in_inline_datum(True, mock_swap_intent_datum)
    |> script_withdrawal(
        is_withdrawal_script_executed,
        mock_swap_script_hash,
        2_000_000,
      )
    |> complete()
}

test s1_spend_success_process_swap() {
  let tx =
    mock_process_swap_tx(
      ProcessSwapTestCase { is_withdrawal_script_executed: True },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    ProcessSwap,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_process_swap_with_no_withdrawal_script_executed() {
  let tx =
    mock_process_swap_tx(
      ProcessSwapTestCase { is_withdrawal_script_executed: False },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    ProcessSwap,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type CancelSwapIntentTestCase {
  is_cancel_time_valid: Bool,
  is_value_unlocked_correctly: Bool,
  is_account_signed: Bool,
}

fn mock_cancel_swap_intent_tx(
  test_case: CancelSwapIntentTestCase,
) -> Transaction {
  let CancelSwapIntentTestCase {
    is_cancel_time_valid,
    is_value_unlocked_correctly,
    is_account_signed,
  } = test_case

  let swap_asset =
    if is_value_unlocked_correctly {
      from_asset_list(mock_swap_from_m_value) |> add("", "", 1500000)
    } else {
      from_asset("A", "abc", 1)
        |> add("C", "def", 10)
    }
  mocktail_tx()
    |> ref_tx_in(
        True,
        mock_tx_hash(0),
        0,
        from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
        mock_vault_oracle_address,
      )
    |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
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
            from_script(mock_swap_script_hash),
            from_asset_list(mock_swap_from_m_value) |> add("", "", 1),
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
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: True,
        is_account_signed: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_mint_fail_cancel_swap_intent_with_invalid_cancel_time() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_cancel_time_valid: False,
        is_value_unlocked_correctly: True,
        is_account_signed: True,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_mint_fail_cancel_swap_intent_with_value_unlocked_incorrect_and_no_sign() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: False,
        is_account_signed: False,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_mint_success_cancel_swap_intent_with_no_account_signature_but_with_value_unlocked_correct() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: True,
        is_account_signed: False,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_mint_success_cancel_swap_intent_with_value_unlocked_incorrect_but_has_sign() {
  let redeemer = CancelIntent
  let tx =
    mock_cancel_swap_intent_tx(
      CancelSwapIntentTestCase {
        is_cancel_time_valid: True,
        is_value_unlocked_correctly: False,
        is_account_signed: True,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

type SpamPreventionTestCase {
  is_dd_signed: Bool,
  datum_type: SpamPreventionDatumType,
  time_scenario: SpamPreventionTimeScenario,
}

type SpamPreventionDatumType {
  NoDatum
  InvalidDatum
  ValidSwapIntentDatum
}

type SpamPreventionTimeScenario {
  After24Hours
  Before24Hours
  FutureCreatedAt
}

fn mock_spam_prevention_tx(test_case: SpamPreventionTestCase) -> Transaction {
  let SpamPreventionTestCase { is_dd_signed, datum_type, time_scenario } =
    test_case

  let input_value =
    from_asset_list(mock_swap_from_m_value) |> add("", "", 2_000_000)

  let base_tx =
    mocktail_tx()
      |> ref_tx_in(
          True,
          mock_tx_hash(0),
          0,
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
          mock_vault_oracle_address,
        )
      |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
      |> tx_in(
          True,
          mock_tx_hash(1),
          0,
          input_value,
          from_script(mock_swap_script_hash),
        )

  let tx_with_datum =
    when datum_type is {
      NoDatum -> base_tx
      InvalidDatum ->
        base_tx |> tx_in_inline_datum(True, Some(mock_vault_oracle_datum))
      ValidSwapIntentDatum ->
        base_tx
          |> tx_in_inline_datum(
              True,
              Some(
                SwapIntentDatum {
                  account_address: mock_account_address,
                  from_amount: mock_swap_from_m_value,
                  to_amount: mock_swap_from_m_value,
                  created_at: mock_created_at,
                  deposit: 1500000,
                },
              ),
            )
    }

  let tx_with_time =
    when time_scenario is {
      After24Hours ->
        tx_with_datum
          |> invalid_before(True, mock_created_at + 86401)
      Before24Hours ->
        tx_with_datum
          |> invalid_before(True, mock_created_at + 1)
          |> invalid_hereafter(True, mock_created_at + 86399)
      FutureCreatedAt ->
        tx_with_datum
          |> invalid_hereafter(True, mock_created_at - 1)
    }

  tx_with_time
    |> complete()
    |> add_extra_signatory(is_dd_signed, mock_dd_key)
}

test s1_spend_success_spam_prevention_no_datum() {
  let tx =
    mock_spam_prevention_tx(
      SpamPreventionTestCase {
        is_dd_signed: True,
        datum_type: NoDatum,
        time_scenario: After24Hours,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    SpamPrevention,
    mock_utxo_ref(1, 0),
    tx,
  )
}

test s1_spend_success_spam_prevention_invalid_datum() {
  let datum: Data = mock_vault_oracle_datum
  let tx =
    mock_spam_prevention_tx(
      SpamPreventionTestCase {
        is_dd_signed: True,
        datum_type: InvalidDatum,
        time_scenario: After24Hours,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    Some(datum),
    SpamPrevention,
    mock_utxo_ref(1, 0),
    tx,
  )
}

test s1_spend_success_spam_prevention_after_24_hours() {
  let datum: Data = mock_swap_intent_datum

  let tx =
    mock_spam_prevention_tx(
      SpamPreventionTestCase {
        is_dd_signed: True,
        datum_type: ValidSwapIntentDatum,
        time_scenario: After24Hours,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    Some(datum),
    SpamPrevention,
    mock_utxo_ref(1, 0),
    tx,
  )
}

test s1_spend_success_spam_prevention_future_created_at() {
  let datum: Data = mock_swap_intent_datum

  let tx =
    mock_spam_prevention_tx(
      SpamPreventionTestCase {
        is_dd_signed: True,
        datum_type: ValidSwapIntentDatum,
        time_scenario: FutureCreatedAt,
      },
    )

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    Some(datum),
    SpamPrevention,
    mock_utxo_ref(1, 0),
    tx,
  )
}

test s1_spend_fail_spam_prevention_not_signed() {
  let tx =
    mock_spam_prevention_tx(
      SpamPreventionTestCase {
        is_dd_signed: False,
        datum_type: NoDatum,
        time_scenario: After24Hours,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    SpamPrevention,
    mock_utxo_ref(1, 0),
    tx,
  )
}

test s1_spend_fail_spam_prevention_valid_intent_within_24_hours() {
  let datum: Data = mock_swap_intent_datum

  let tx =
    mock_spam_prevention_tx(
      SpamPreventionTestCase {
        is_dd_signed: True,
        datum_type: ValidSwapIntentDatum,
        time_scenario: Before24Hours,
      },
    )

  !swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    Some(datum),
    SpamPrevention,
    mock_utxo_ref(1, 0),
    tx,
  )
}

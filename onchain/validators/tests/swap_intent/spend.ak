use cardano/address.{from_script}
use cardano/assets.{add, from_asset}
use cardano/transaction.{Transaction}
use mocktail.{
  complete, mint, mock_tx_hash, mock_utxo_ref, mocktail_tx, tx_in,
  tx_in_inline_datum,
}
use swap_intent/spend_mint_withdraw_publish as swap_intent_spend_mint_withdraw_publish
use tests/utils.{
  mock_swap_intent_datum, mock_swap_intent_script_hash, mock_vault_oracle,
}

type ProcessSwapTestCase {
  is_intent_burnt: Bool,
}

fn mock_process_swap_tx(test_case: ProcessSwapTestCase) -> Transaction {
  let ProcessSwapTestCase { is_intent_burnt } = test_case

  let input_value =
    from_asset(mock_swap_intent_script_hash, "", 1)
      |> add("", "", 2_000_000)

  mocktail_tx()
    |> tx_in(
        True,
        mock_tx_hash(0),
        0,
        input_value,
        from_script(mock_swap_intent_script_hash),
      )
    |> tx_in_inline_datum(True, mock_swap_intent_datum)
    |> mint(is_intent_burnt, -3, mock_swap_intent_script_hash, "")
    |> complete()
}

test s1_spend_success_process_swap() {
  let tx = mock_process_swap_tx(ProcessSwapTestCase { is_intent_burnt: True })

  swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    None,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_process_swap_with_no_withdrawal_script_executed() {
  let tx = mock_process_swap_tx(ProcessSwapTestCase { is_intent_burnt: False })

  !swap_intent_spend_mint_withdraw_publish.swap_intent.spend(
    mock_vault_oracle,
    None,
    None,
    mock_utxo_ref(0, 0),
    tx,
  )
}

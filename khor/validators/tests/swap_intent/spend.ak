use cardano/address.{from_script}
use cardano/assets.{add, from_asset}
use cardano/transaction.{Mint, Transaction}
use mocktail.{
  add_redeemer, complete, mint, mock_tx_hash, mock_utxo_ref, mocktail_tx, tx_in,
  tx_in_inline_datum,
}
use swap_intent/spend_and_mint as swap_intent_spend_and_mint
use tests/utils.{
  mock_burn_intent_redeemer, mock_swap_intent_datum,
  mock_swap_intent_script_hash, mock_vault_oracle, mock_vault_script_hash,
}
use types.{MintIntent}

type ProcessSwapTestCase {
  is_mint_policy_correct: Bool,
  is_mint_redeemer_correct: Bool,
}

fn mock_process_swap_tx(test_case: ProcessSwapTestCase) -> Transaction {
  let ProcessSwapTestCase { is_mint_policy_correct, is_mint_redeemer_correct } =
    test_case

  let mint_redeemer: Data =
    if is_mint_redeemer_correct {
      mock_burn_intent_redeemer
    } else {
      MintIntent
    }
  let intent_policy_id =
    if is_mint_policy_correct {
      mock_swap_intent_script_hash
    } else {
      mock_vault_script_hash
    }
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
    |> mint(True, 1, intent_policy_id, "")
    |> complete()
    |> add_redeemer(True, Pair(Mint(intent_policy_id), mint_redeemer))
}

test s1_spend_success_process_swap() {
  let tx =
    mock_process_swap_tx(
      ProcessSwapTestCase {
        is_mint_policy_correct: True,
        is_mint_redeemer_correct: True,
      },
    )

  swap_intent_spend_and_mint.swap_intent.spend(
    mock_vault_oracle,
    None,
    None,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_process_swap_with_incorrect_mint_policy() fail {
  let tx =
    mock_process_swap_tx(
      ProcessSwapTestCase {
        is_mint_policy_correct: False,
        is_mint_redeemer_correct: True,
      },
    )

  swap_intent_spend_and_mint.swap_intent.spend(
    mock_vault_oracle,
    None,
    None,
    mock_utxo_ref(0, 0),
    tx,
  )
}

test s1_spend_fail_process_swap_with_incorrect_mint_redeemer() fail {
  let tx =
    mock_process_swap_tx(
      ProcessSwapTestCase {
        is_mint_policy_correct: True,
        is_mint_redeemer_correct: False,
      },
    )

  swap_intent_spend_and_mint.swap_intent.spend(
    mock_vault_oracle,
    None,
    None,
    mock_utxo_ref(0, 0),
    tx,
  )
}

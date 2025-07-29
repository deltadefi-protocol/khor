use cardano/address.{from_script}
use cardano/assets.{add, from_asset, from_asset_list}
use cardano/transaction.{Transaction}
use mocktail.{
  add_input, add_output, complete, mint, mock_policy_id, mock_tx_hash,
  mock_utxo_ref, mocktail_tx, ref_tx_in, ref_tx_in_inline_datum, tx_in,
  tx_in_inline_datum, tx_out, tx_out_inline_datum,
}
use swap_intent/spend_and_mint as swap_intent_spend_and_mint
use tests/utils.{
  mock_app_oracle, mock_app_oracle_address, mock_input_oracle_datum,
  mock_message, mock_pluggable_logic, mock_signatures, mock_swap_intent_datum,
  mock_swap_intent_script_hash, mock_swap_m_value, mock_vault_oracle,
  mock_vault_oracle_address, mock_vault_oracle_datum, to_mvalue,
}
use types.{BurnIntent, MValue, MintIntent, VaultOracleDatum}

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
      mock_swap_m_value
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

test s2_mint_success_mint_swap_intent() {
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

test s2_mint_fail_mint_swap_intent_with_no_intent_minted() {
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

test s2_mint_fail_mint_swap_intent_with_intent_output_not_clean() {
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

test s2_mint_fail_mint_swap_intent_with_value_locked_incorrect() {
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

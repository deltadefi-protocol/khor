use cardano/address.{Address, Script}
use cardano/assets.{add, from_asset, from_asset_list, merge}
use cardano/transaction.{Input, NoDatum, Transaction}
use mocktail.{
  add_extra_signatory, add_input, add_output, complete, mint, mock_tx_hash,
  mock_utxo_ref, mocktail_tx, ref_tx_in, ref_tx_in_inline_datum,
}
use mocktail/virgin_outputs.{mock_output}
use swap_intent/spend_mint_withdraw_publish as swap_intent_spend_mint_withdraw_publish
use tests/swap_utils/process_batch.{
  intent_input_c, intent_output_c, intent_output_value_c, m_value_c_from,
}
use tests/utils.{
  mock_dd_key, mock_operator_cred, mock_operator_key,
  mock_swap_intent_script_hash, mock_vault_oracle, mock_vault_oracle_address,
  mock_vault_oracle_datum,
}
use types.{ProcessIntent}

//todo
const indices =
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

// current max = 18
// MAX [mem: 14,000,000, cpu: 10,000,000,000]
// PASS [mem: 13,341,098, cpu: 3,995,188,846]

fn mock_burn_swap_intent_tx() -> Transaction {
  let vault_oracle_input_value =
    from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000)

  //todo
  let intent_burn_amount = 19
  //todo
  let vault_input_a =
    Input {
      output_reference: mock_utxo_ref(10, 0),
      output: mock_output(
        Address {
          payment_credential: mock_operator_cred,
          stake_credential: None,
        },
        intent_output_value_c
          |> add("", "", -1500000)
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000))
          |> merge(intent_output_value_c |> add("", "", -1500000)),
        NoDatum,
        None,
      ),
    }
  //todo
  let vault_output =
    mock_output(
      Address { payment_credential: mock_operator_cred, stake_credential: None },
      from_asset_list(m_value_c_from)
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from))
        |> merge(from_asset_list(m_value_c_from)),
      NoDatum,
      None,
    )

  mocktail_tx()
    |> ref_tx_in(
        True,
        mock_tx_hash(0),
        0,
        vault_oracle_input_value,
        mock_vault_oracle_address,
      )
    |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
    |> mint(True, -intent_burn_amount, mock_swap_intent_script_hash, "")
    |> complete()
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, intent_input_c)
    |> add_input(True, vault_input_a)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, intent_output_c)
    |> add_output(True, vault_output)
    |> add_extra_signatory(True, mock_operator_key)
    |> add_extra_signatory(True, mock_dd_key)
}

test swap_batch_limit_test() {
  let redeemer = ProcessIntent(indices)
  let tx = mock_burn_swap_intent_tx()

  swap_intent_spend_mint_withdraw_publish.swap_intent.withdraw(
    mock_vault_oracle,
    redeemer,
    Script(mock_swap_intent_script_hash),
    tx,
  )
}

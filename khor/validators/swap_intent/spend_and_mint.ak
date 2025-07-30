use aiken/collection/list
use cardano/address.{Script, from_script, from_verification_key}
use cardano/assets.{PolicyId, add, from_asset_list, lovelace_of}
use cardano/transaction.{Mint, OutputReference, Transaction, find_input}
use cocktail.{
  get_all_value_from, get_all_value_to, output_inline_datum, outputs_at,
  outputs_at_with_policy, policy_only_minted_token,
}
use swap_utils.{process_batched_swap_intent_validation}
use types.{
  BurnIntent, IntentRedeemer, MintIntent, SwapIntentDatum, VaultOracleDatum,
}
use utils.{check_mint_redeemer_is_burn, get_vault_oracle_datum}

validator swap_intent(oracle_nft: PolicyId) {
  spend(
    _datum_opt: Option<SwapIntentDatum>,
    _r,
    input: OutputReference,
    self: Transaction,
  ) {
    let Transaction { inputs, redeemers, .. } = self

    expect Some(own_input) =
      inputs
        |> find_input(input)

    expect Script(own_hash) = own_input.output.address.payment_credential
    let mint_purpose = Mint(own_hash)

    check_mint_redeemer_is_burn(mint_purpose, redeemers)?
  }

  mint(redeemer: IntentRedeemer, policy_id: PolicyId, self: Transaction) {
    let Transaction { inputs, outputs, mint, reference_inputs, .. } = self

    when
      (
        redeemer,
        outputs_at_with_policy(outputs, from_script(policy_id), policy_id),
      )
    is {
      (MintIntent, [intent_output]) -> {
        let is_mint_value_correct =
          policy_only_minted_token(mint, policy_id, "", 1)
        expect SwapIntentDatum { from_amount, .. }: SwapIntentDatum =
          output_inline_datum(intent_output)

        let is_value_locked =
          intent_output.value == (
            from_asset_list(from_amount) |> add(policy_id, "", 1)
          )
        is_value_locked? && is_mint_value_correct?
      }
      (BurnIntent(indices), _) -> {
        // - Get the vault oracle input datum
        let vault_oracle_input_datum: VaultOracleDatum =
          reference_inputs |> get_vault_oracle_datum(oracle_nft)

        let VaultOracleDatum {
          vault_script_hash,
          operator_key,
          swap_charge,
          ..
        } = vault_oracle_input_datum

        let (total_intent_datum_m_value, total_swap_fee) =
          process_batched_swap_intent_validation(
            inputs,
            outputs,
            indices,
            swap_charge,
            policy_id,
          )

        // - Check the intent burn amount == length of batched intents
        let intent_burn_check =
          policy_only_minted_token(mint, policy_id, "", -list.length(indices))

        // - Check the operator output value == swap_fee
        // - Check the operator output address == operator_key
        expect [swap_fee_output] =
          outputs_at(outputs, from_verification_key(operator_key))
        let swap_fee_output_check =
          lovelace_of(swap_fee_output.value) == total_swap_fee

        let value_from_vault =
          get_all_value_from(inputs, from_script(vault_script_hash))

        let value_to_vault =
          get_all_value_to(outputs, from_script(vault_script_hash))
        intent_burn_check? && swap_fee_output_check?
      }
      _ -> False
    }
  }

  else(_) {
    fail
  }
}

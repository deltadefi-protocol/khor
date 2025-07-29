use aiken/cbor
use aiken/collection/list
use cardano/address.{Script, from_script}
use cardano/assets.{PolicyId, add, from_asset_list}
use cardano/transaction.{
  DatumHash, InlineDatum, Mint, NoDatum, OutputReference, Transaction,
  find_input,
}
use cocktail.{
  output_inline_datum, outputs_at_with_policy, outputs_with_policy,
  policy_only_minted_token, value_length,
}
use types.{
  AppOracleDatum, BurnIntent, HydraInfo, IntentRedeemer, MintIntent,
  SwapIntentDatum, VaultOracleDatum,
}
use utils.{
  check_mint_redeemer_is_burn, get_app_oracle_datum, get_vault_oracle_input,
  verify_pub_keys, verify_signatures,
}

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
        expect SwapIntentDatum { amount, .. }: SwapIntentDatum =
          output_inline_datum(intent_output)

        let is_value_locked =
          intent_output.value == (
            from_asset_list(amount) |> add(policy_id, "", 1)
          )
        is_value_locked? && is_mint_value_correct?
      }
      (BurnIntent(indices, message, signatures), _) -> {
        // - Get the vault oracle input datum
        let vault_oracle_input = get_vault_oracle_input(inputs, oracle_nft)

        let vault_oracle_input_data: Data =
          when vault_oracle_input.output.datum is {
            NoDatum -> fail @"Vault oracle input does not contain any datum"
            DatumHash(_) -> fail @"Vault oracle input datum must be inlined"
            InlineDatum(data) -> data
          }
        expect vault_oracle_input_datum: VaultOracleDatum =
          vault_oracle_input_data

        let VaultOracleDatum { app_oracle, node_pub_key, .. } =
          vault_oracle_input_datum

        // - Get the app oracle input datum
        let app_oracle_input_datum: AppOracleDatum =
          reference_inputs |> get_app_oracle_datum(app_oracle)
        let AppOracleDatum {
          app_deposit_request_token,
          app_deposit_request_address,
          hydra_info,
          ..
        } = app_oracle_input_datum
        let HydraInfo { hydra_signers, .. } = hydra_info

        // - Verify the node public keys and signatures
        let keys_check = verify_pub_keys(node_pub_key, hydra_signers)
        let signatures_check =
          verify_signatures(node_pub_key, message, signatures)

        keys_check? && signatures_check?
      }
      _ -> False
    }
  }

  else(_) {
    fail
  }
}

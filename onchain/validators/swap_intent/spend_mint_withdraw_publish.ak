use aiken/collection/list
use cardano/address.{Credential, Script, from_script}
use cardano/assets.{PolicyId, add, flatten, from_asset_list, merge}
use cardano/transaction.{OutputReference, Transaction, find_input}
use cocktail.{
  address_payment_key, all_key_signed, get_all_value_from_cred,
  get_all_value_to_cred, input_inline_datum, inputs_at_with_policy, key_signed,
  output_inline_datum, outputs_at, outputs_at_with_policy,
  policy_only_minted_token, valid_after,
}
use swap_utils.{process_batched_swap_intent_validation}
use types.{
  BurnIntent, CancelIntent, IntentRedeemer, MintIntent, ProcessIntent,
  SwapIntentDatum, SwapIntentWithdrawRedeemer, VaultOracleDatum,
}
use utils.{get_vault_oracle_datum, withdrawal_script_validated}

validator swap_intent(oracle_nft: PolicyId) {
  spend(
    _datum_opt: Option<SwapIntentDatum>,
    _r,
    input: OutputReference,
    self: Transaction,
  ) {
    let Transaction { inputs, mint, .. } = self

    expect Some(own_input) =
      inputs
        |> find_input(input)

    expect Script(own_hash) = own_input.output.address.payment_credential
    let is_intent_burnt =
      when
        flatten(mint)
          |> list.filter(fn(asset) { asset.1st == own_hash })
      is {
        [(_, _, minted_quantity)] -> minted_quantity < 0
        _ -> False
      }
    is_intent_burnt?
  }

  mint(redeemer: IntentRedeemer, policy_id: PolicyId, self: Transaction) {
    let Transaction {
      outputs,
      inputs,
      mint,
      withdrawals,
      extra_signatories,
      validity_range,
      ..
    } = self

    when
      (
        redeemer,
        outputs_at_with_policy(outputs, from_script(policy_id), policy_id),
      )
    is {
      (MintIntent, [intent_output]) -> {
        let is_mint_value_correct =
          policy_only_minted_token(mint, policy_id, "", 1)
        expect SwapIntentDatum { from_amount, deposit, .. }: SwapIntentDatum =
          output_inline_datum(intent_output)

        let is_value_locked =
          intent_output.value == (
            from_asset_list(from_amount)
              |> add(policy_id, "", 1)
              |> add("", "", deposit)
          )
        is_value_locked? && is_mint_value_correct?
      }
      (BurnIntent, _) -> withdrawal_script_validated(withdrawals, policy_id)

      (CancelIntent, _) ->
        when
          inputs_at_with_policy(inputs, from_script(policy_id), policy_id)
        is {
          [intent_input] -> {
            expect SwapIntentDatum { account_address, created_at, .. }: SwapIntentDatum =
              input_inline_datum(intent_input)
            let is_cancel_time_valid =
              valid_after(validity_range, created_at + 600)
            let is_mint_value_correct =
              policy_only_minted_token(mint, policy_id, "", -1)
            let account_check =
              when
                key_signed(
                  extra_signatories,
                  address_payment_key(account_address),
                )
              is {
                True -> True
                False -> {
                  expect [account_output] = outputs_at(outputs, account_address)
                  let is_value_unlocked =
                    account_output.value == (
                      intent_input.output.value |> add(policy_id, "", -1)
                    )
                  is_value_unlocked?
                }
              }
            is_cancel_time_valid? && is_mint_value_correct? && account_check?
          }
          _ -> False
        }
      _ -> False
    }
  }

  withdraw(
    redeemer: SwapIntentWithdrawRedeemer,
    account: Credential,
    self: Transaction,
  ) {
    let Transaction {
      inputs,
      outputs,
      mint,
      reference_inputs,
      extra_signatories,
      fee,
      ..
    } = self
    let vault_oracle_input_datum: VaultOracleDatum =
      reference_inputs |> get_vault_oracle_datum(oracle_nft)

    let VaultOracleDatum { vault_script_hash, operator_key, dd_key, .. } =
      vault_oracle_input_datum

    expect Script(policy_id) = account
    let ProcessIntent(indices) = redeemer
    // change = value from vault - value to vault = decrease in vault
    let total_vault_change =
      process_batched_swap_intent_validation(
        inputs,
        outputs,
        indices,
        policy_id,
      )

    // - Check the intent burn amount == length of batched intents
    let intent_burn_check =
      policy_only_minted_token(mint, policy_id, "", -list.length(indices))

    let value_from_vault = get_all_value_from_cred(inputs, vault_script_hash)

    let value_to_vault = get_all_value_to_cred(outputs, vault_script_hash)

    let vault_unlock_value_check =
      value_from_vault == (
        value_to_vault |> merge(total_vault_change) |> add("", "", fee)
      )
    let signature_check =
      all_key_signed(extra_signatories, [operator_key, dd_key])
    intent_burn_check? && signature_check? && vault_unlock_value_check?
  }

  publish(_r, _c, self: Transaction) {
    let Transaction { reference_inputs, extra_signatories, .. } = self

    let vault_oracle_input_datum: VaultOracleDatum =
      reference_inputs |> get_vault_oracle_datum(oracle_nft)

    let VaultOracleDatum { operator_key, .. } = vault_oracle_input_datum

    key_signed(extra_signatories, operator_key)?
  }

  else(_) {
    fail
  }
}

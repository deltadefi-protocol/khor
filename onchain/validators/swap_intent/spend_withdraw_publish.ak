use aiken/interval.{is_entirely_after, is_entirely_before}
use cardano/address.{Credential, Script}
use cardano/assets.{PolicyId, add, merge}
use cardano/transaction.{OutputReference, Transaction, find_input}
use cocktail.{
  address_payment_key, all_key_signed, get_all_value_from_cred,
  get_all_value_to_cred, input_inline_datum, inputs_at, key_signed, value_geq,
}
use swap_utils.{process_batched_swap_intent_validation}
use types.{
  CancelIntent, OracleDatum, ProcessIntent, ProcessSwap, SpamPrevention,
  SpendRedeemer, SwapIntentDatum, SwapIntentWithdrawRedeemer,
}
use utils.{get_oracle_datum, withdrawal_script_validated}

validator swap_intent(oracle_nft: PolicyId) {
  spend(
    datum_opt: Option<Data>,
    redeemer: SpendRedeemer,
    input: OutputReference,
    self: Transaction,
  ) {
    let Transaction {
      inputs,
      withdrawals,
      reference_inputs,
      validity_range,
      extra_signatories,
      outputs,
      fee,
      ..
    } = self

    when redeemer is {
      ProcessSwap -> {
        let oracle_input_datum: OracleDatum =
          reference_inputs |> get_oracle_datum(oracle_nft)

        let OracleDatum { swap_script_hash, .. } = oracle_input_datum
        withdrawal_script_validated(withdrawals, swap_script_hash)
      }
      CancelIntent -> {
        expect Some(own_input) = find_input(inputs, input)

        when inputs_at(inputs, own_input.output.address) is {
          [only_input] -> {
            expect SwapIntentDatum { account_address, created_at, .. }: SwapIntentDatum =
              input_inline_datum(only_input)

            // Get oracle datum for operator_key
            let oracle_input_datum: OracleDatum =
              reference_inputs |> get_oracle_datum(oracle_nft)
            let OracleDatum { operator_key, .. } = oracle_input_datum

            // Time check OR operator signature
            let time_or_operator_check =
              when key_signed(extra_signatories, operator_key) is {
                True -> True
                False -> is_entirely_after(validity_range, created_at + 600)
              }

            // Account signature OR value returned to account
            let account_check =
              when
                key_signed(
                  extra_signatories,
                  address_payment_key(account_address),
                )
              is {
                True -> True
                False -> {
                  let value_from_account =
                    get_all_value_from_cred(
                      inputs,
                      account_address.payment_credential,
                    )

                  let value_to_account =
                    get_all_value_to_cred(
                      outputs,
                      account_address.payment_credential,
                    )

                  let is_value_unlocked =
                    value_to_account
                      |> add("", "", fee)
                      |> value_geq(
                          only_input.output.value
                            |> merge(value_from_account),
                        )

                  is_value_unlocked?
                }
              }
            time_or_operator_check? && account_check?
          }
          _ -> False
        }
      }
      SpamPrevention -> {
        let oracle_input_datum: OracleDatum =
          reference_inputs |> get_oracle_datum(oracle_nft)

        let OracleDatum { dd_key, .. } = oracle_input_datum

        let is_dd_key_signed = key_signed(extra_signatories, dd_key)

        let datum_check =
          when datum_opt is {
            Some(datum) ->
              if datum is SwapIntentDatum {
                let SwapIntentDatum { created_at, .. }: SwapIntentDatum = datum
                let time_check =
                  is_entirely_after(validity_range, created_at + 86400) || is_entirely_before(
                    validity_range,
                    created_at,
                  )
                time_check?
              } else {
                True
              }
            None -> True
          }
        datum_check? && is_dd_key_signed
      }
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
      reference_inputs,
      extra_signatories,
      fee,
      ..
    } = self
    let oracle_input_datum: OracleDatum =
      reference_inputs |> get_oracle_datum(oracle_nft)

    let OracleDatum { operator_cred, operator_key, dd_key, .. } =
      oracle_input_datum

    expect Script(policy_id) = account
    let ProcessIntent(indices) = redeemer
    // change = value from operator - value to operator = decrease in operator
    let total_operator_net_outflow =
      process_batched_swap_intent_validation(
        inputs,
        outputs,
        indices,
        policy_id,
      )

    let value_from_operator = get_all_value_from_cred(inputs, operator_cred)

    let value_to_operator = get_all_value_to_cred(outputs, operator_cred)

    let operator_unlock_value_check =
      value_from_operator == (
        value_to_operator
          |> merge(total_operator_net_outflow)
          |> add("", "", fee)
      )
    let signature_check =
      all_key_signed(extra_signatories, [operator_key, dd_key])
    signature_check? && operator_unlock_value_check?
  }

  publish(_r, _c, self: Transaction) {
    let Transaction { reference_inputs, extra_signatories, .. } = self

    let oracle_input_datum: OracleDatum =
      reference_inputs |> get_oracle_datum(oracle_nft)

    let OracleDatum { operator_key, .. } = oracle_input_datum

    key_signed(extra_signatories, operator_key)?
  }

  else(_) {
    fail
  }
}

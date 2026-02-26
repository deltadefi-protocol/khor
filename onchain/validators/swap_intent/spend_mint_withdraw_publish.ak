use aiken/interval.{is_entirely_after, is_entirely_before}
use cardano/address.{Credential, Script}
use cardano/assets.{PolicyId, add, merge}
use cardano/transaction.{OutputReference, Transaction, find_input}
use cocktail.{
  address_payment_key, all_key_signed, get_all_value_from_cred,
  get_all_value_to_cred, input_inline_datum, inputs_at, key_signed, outputs_at,
  value_geq,
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
      ..
    } = self

    let oracle_input_datum: OracleDatum =
      reference_inputs |> get_oracle_datum(oracle_nft)

    let OracleDatum { dd_key, swap_script_hash, .. } = oracle_input_datum

    when redeemer is {
      ProcessSwap -> withdrawal_script_validated(withdrawals, swap_script_hash)
      CancelIntent -> {
        expect Some(own_input) = find_input(inputs, input)

        when inputs_at(inputs, own_input.output.address) is {
          [only_input] -> {
            expect SwapIntentDatum { account_address, created_at, .. }: SwapIntentDatum =
              input_inline_datum(only_input)
            let is_cancel_time_valid =
              is_entirely_after(validity_range, created_at + 600)
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
                    account_output.value
                      |> value_geq(only_input.output.value)
                  is_value_unlocked?
                }
              }
            is_cancel_time_valid? && account_check?
          }
          _ -> False
        }
      }
      SpamPrevention -> {
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

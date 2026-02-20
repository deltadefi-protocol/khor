use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{ScriptHash}
use cardano/address.{Script}
use cardano/assets.{Value, add, merge, quantity_of, zero}
use cardano/transaction.{Input, Output}
use cocktail.{input_inline_datum}
use types.{MValue, SwapIntentDatum}

// change = value from vault - value to vault = decrease in vault
pub fn calculate_vault_change(from_amount: MValue, output_value: Value) -> Value {
  pairs.foldl(
    from_amount,
    output_value,
    fn(policy_id, unit, result) {
      pairs.foldl(
        unit,
        result,
        fn(asset_name, amount, nested_result) {
          nested_result |> add(policy_id, asset_name, -amount)
        },
      )
    },
  )
}

pub fn validate_minimum_output_value(value: Value, to_amount: MValue) -> Bool {
  pairs.foldl(
    to_amount,
    True,
    fn(policy_id, unit, result) {
      result && pairs.foldl(
        unit,
        True,
        fn(asset_name, amount, nested_result) {
          quantity_of(value, policy_id, asset_name) >= amount && nested_result
        },
      )
    },
  )
}

pub type Scott2<a, b, result> =
  fn(a, b) -> result

pub fn list_foldl2(
  self: List<x>,
  zero_a: a,
  zero_b: b,
  with: fn(x, a, b, Scott2<a, b, result>) -> result,
  return: Scott2<a, b, result>,
) -> result {
  when self is {
    [] -> return(zero_a, zero_b)
    [x, ..xs] -> {
      let acc_a, acc_b <- with(x, zero_a, zero_b)
      list_foldl2(xs, acc_a, acc_b, with, return)
    }
  }
}

// 1. sum up total vault change
// 2. cal output value to user
pub fn process_batched_swap_intent_validation(
  inputs: List<Input>,
  outputs: List<Output>,
  indices: List<Int>,
  script_hash: ScriptHash,
) -> Value {
  let
    processed_indices,
    total_vault_change,
  <-
    list_foldl2(
      inputs,
      indices,
      zero,
      fn(input, remaining_indices, cal_vault_change, return) {
        when input.output.address.payment_credential is {
          Script(script) ->
            if script == script_hash {
              when remaining_indices is {
                // Found the swap intent script address
                [] -> fail @"More UTxOs are spent than specified"
                [output_index, ..rest_of_indices] -> {
                  expect Some(out_utxo) = outputs |> list.at(output_index)
                  expect input_datum: SwapIntentDatum =
                    input_inline_datum(input)

                  let SwapIntentDatum {
                    account_address,
                    from_amount,
                    to_amount,
                    ..
                  } = input_datum

                  let new_cal_vault_change =
                    cal_vault_change
                      |> merge(
                          calculate_vault_change(from_amount, out_utxo.value),
                        )

                  // - Check the output value and address
                  let output_check =
                    validate_minimum_output_value(out_utxo.value, to_amount) && out_utxo.address == account_address
                  if output_check {
                    return(rest_of_indices, new_cal_vault_change)
                  } else {
                    fail @"Swap intent output incorrect"
                  }
                }
              }
            } else {
              // Not the swap intent script address, skip
              return(remaining_indices, cal_vault_change)
            }
          _ ->
            // Not a script address, skip
            return(remaining_indices, cal_vault_change)
        }
      },
    )
  when processed_indices is {
    [] -> total_vault_change
    _ -> fail @"Batch swap intent UTxOs not fully processed"
  }
}

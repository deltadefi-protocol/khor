use aiken/collection/dict
use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{ScriptHash}
use cardano/address.{Script}
use cardano/assets.{Value, from_asset_list, quantity_of}
use cardano/transaction.{Input, Output}
use cocktail.{input_inline_datum}
use types.{MValue, SwapIntentDatum}

// attention: AssetName sorted in ascending lexicographic
pub fn combine_m_value(left_m_value: MValue, right_m_value: MValue) -> MValue {
  let left_dict = dict.from_pairs(left_m_value)
  let right_dict = dict.from_pairs(right_m_value)

  dict.union_with(
    left_dict,
    right_dict,
    fn(_k, v1, v2) {
      let v1_dict = dict.from_pairs(v1)
      let v2_dict = dict.from_pairs(v2)
      let all =
        dict.union_with(
          v1_dict,
          v2_dict,
          fn(_k, v_v_1, v_v_2) { Some(v_v_1 + v_v_2) },
        )
          |> dict.to_pairs()
      Some(all)
    },
  )
    |> dict.to_pairs()
}

// attention: AssetName sorted in ascending lexicographic
pub fn subtract_m_value(left_m_value: MValue, right_m_value: MValue) -> MValue {
  let left_dict = dict.from_pairs(left_m_value)
  let right_dict = dict.from_pairs(right_m_value)

  dict.union_with(
    left_dict,
    right_dict,
    fn(_k, v1, v2) {
      let v1_dict = dict.from_pairs(v1)
      let v2_dict = dict.from_pairs(v2)
      let all =
        dict.union_with(
          v1_dict,
          v2_dict,
          fn(_k, v_v_1, v_v_2) { Some(v_v_1 - v_v_2) },
        )
          |> dict.to_pairs()
      Some(all)
    },
  )
    |> dict.to_pairs()
}

pub fn cal_vault_change(m_value: MValue) -> Value {
  let m_value_dict = dict.from_pairs(m_value)

  let filtered_zero_m_value_dict =
    dict.map(
      m_value_dict,
      fn(_policy_id, asset_name_amount) {
        dict.from_pairs(asset_name_amount)
          |> dict.filter(fn(_, amount) { amount > 0 })
          |> dict.to_pairs()
      },
    )

  let filtered_empty_m_value_dict =
    dict.filter(
      filtered_zero_m_value_dict,
      fn(_policy_id, asset_name_amount_dict) {
        !list.is_empty(asset_name_amount_dict)
      },
    )

  filtered_empty_m_value_dict
    |> dict.to_pairs()
    |> from_asset_list()
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

pub type Scott3<a, b, c, result> =
  fn(a, b, c) -> result

pub fn list_foldl3(
  self: List<x>,
  zero_a: a,
  zero_b: b,
  zero_c: c,
  with: fn(x, a, b, c, Scott3<a, b, c, result>) -> result,
  return: Scott3<a, b, c, result>,
) -> result {
  when self is {
    [] -> return(zero_a, zero_b, zero_c)
    [x, ..xs] -> {
      let acc_a, acc_b, acc_c <- with(x, zero_a, zero_b, zero_c)
      list_foldl3(xs, acc_a, acc_b, acc_c, with, return)
    }
  }
}

// 1. sum up the intent total m_value
// 2. sum up swap fee todo
// 4. cal output value to user todo
pub fn process_batched_swap_intent_validation(
  inputs: List<Input>,
  outputs: List<Output>,
  indices: List<Int>,
  swap_charge: Int,
  script_hash: ScriptHash,
) -> (MValue, Int) {
  let empty_m_value: MValue = []
  let
    processed_indices,
    total_vault_change,
    total_swap_fee,
  <-
    list_foldl3(
      inputs,
      indices,
      empty_m_value,
      0,
      fn(input, remaining_indices, cal_vault_change, cal_swap_fee, return) {
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
                  } = input_datum

                  let new_cal_vault_change =
                    combine_m_value(
                      cal_vault_change,
                      subtract_m_value(from_amount, to_amount),
                    )

                  // - Check the output value and address
                  let output_check =
                    validate_minimum_output_value(out_utxo.value, to_amount) && out_utxo.address == account_address
                  if output_check {
                    return(rest_of_indices, new_cal_vault_change, cal_swap_fee)
                  } else {
                    fail @"Swap intent output incorrect"
                  }
                }
              }
            } else {
              // Not the swap intent script address, skip
              return(remaining_indices, cal_vault_change, cal_swap_fee)
            }
          _ ->
            // Not a script address, skip
            return(remaining_indices, cal_vault_change, cal_swap_fee)
        }
      },
    )
  when processed_indices is {
    [] -> (total_vault_change, total_swap_fee)
    _ -> fail @"Batch swap intent UTxOs not fully processed"
  }
}

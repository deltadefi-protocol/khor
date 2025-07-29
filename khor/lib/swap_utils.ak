use aiken/cbor
use aiken/collection/dict
use aiken/collection/list
use aiken/collection/pairs
use aiken/crypto.{ScriptHash}
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{AssetName, PolicyId, Value, quantity_of}
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
// 3. sum up total output value todo
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
    total_intent_datum_m_value,
    total_swap_fee,
  <-
    list_foldl3(
      inputs,
      indices,
      empty_m_value,
      0,
      fn(
        input,
        remaining_indices,
        cal_intent_datum_m_value,
        cal_swap_fee,
        return,
      ) {
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

                  let SwapIntentDatum { account_address, amount, swap_pair } =
                    input_datum

                  let new_cal_intent_datum_m_value =
                    combine_m_value(cal_intent_datum_m_value, amount)

                  // - Check the output value and address
                  let output_check =
                    True && // todo
                    out_utxo.address == account_address
                  if output_check {
                    return(
                      rest_of_indices,
                      new_cal_intent_datum_m_value,
                      cal_swap_fee,
                    )
                  } else {
                    fail @"Swap intent output incorrect"
                  }
                }
              }
            } else {
              // Not the swap intent script address, skip
              return(remaining_indices, cal_intent_datum_m_value, cal_swap_fee)
            }
          _ ->
            // Not a script address, skip
            return(remaining_indices, cal_intent_datum_m_value, cal_swap_fee)
        }
      },
    )
  when processed_indices is {
    [] -> (total_intent_datum_m_value, total_swap_fee)
    _ -> fail @"Batch swap intent UTxOs not fully processed"
  }
}

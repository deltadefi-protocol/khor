use cardano/assets.{PolicyId}
use cardano/transaction.{OutputReference, Transaction, find_input}
use cocktail.{all_key_signed, output_inline_datum, outputs_at_with_policy}
use types.{OracleDatum}

validator swap_oracle(oracle_nft: PolicyId) {
  spend(
    datum_opt: Option<OracleDatum>,
    _r,
    input: OutputReference,
    self: Transaction,
  ) {
    let Transaction { extra_signatories, outputs, inputs, .. } = self

    when datum_opt is {
      Some(datum) -> {
        let OracleDatum { operator_key, dd_key, .. } = datum

        expect Some(own_input) = find_input(inputs, input)

        expect [oracle_output] =
          outputs_at_with_policy(outputs, own_input.output.address, oracle_nft)
        expect oracle_output_datum: OracleDatum =
          output_inline_datum(oracle_output)

        let oracle_datum_check =
          oracle_output_datum.operator_key == operator_key && oracle_output_datum.dd_key == dd_key
        all_key_signed(extra_signatories, [operator_key, dd_key])? && oracle_datum_check?
      }
      None -> False
    }
  }

  else(_) {
    fail
  }
}

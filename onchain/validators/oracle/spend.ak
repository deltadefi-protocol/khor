use cardano/assets.{PolicyId}
use cardano/transaction.{Transaction}
use cocktail.{key_signed}
use types.{OracleDatum}

validator swap_oracle(_oracle_nft: PolicyId) {
  spend(datum_opt: Option<OracleDatum>, _r, _i, self: Transaction) {
    let Transaction { extra_signatories, .. } = self

    when datum_opt is {
      Some(datum) -> {
        let OracleDatum { operator_key, .. } = datum

        key_signed(extra_signatories, operator_key)?
      }
      None -> False
    }
  }

  else(_) {
    fail
  }
}

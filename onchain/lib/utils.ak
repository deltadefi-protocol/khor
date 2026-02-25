use aiken/collection/list
use aiken/collection/pairs.{has_key}
use aiken/crypto.{ScriptHash}
use cardano/address.{Credential, Script}
use cardano/assets.{Lovelace, PolicyId, quantity_of}
use cardano/transaction.{
  DatumHash, InlineDatum, Input, NoDatum, Output, Redeemer, ScriptPurpose,
}
use types.{BurnIntent, IntentRedeemer, OracleDatum}

pub fn get_oracle_datum(
  inputs: List<Input>,
  oracle_nft: PolicyId,
) -> OracleDatum {
  expect Some(oracle_input) =
    inputs
      |> list.find(
          fn(input: Input) {
            quantity_of(input.output.value, oracle_nft, "") == 1
          },
        )

  let oracle_input_data: Data =
    when oracle_input.output.datum is {
      NoDatum -> fail @"Oracle input does not contain any datum"
      DatumHash(_) -> fail @"Oracle input datum must be inlined"
      InlineDatum(data) -> data
    }
  expect oracle_input_datum: OracleDatum = oracle_input_data
  oracle_input_datum
}

pub fn get_vault_oracle_input(
  inputs: List<Input>,
  oracle_nft: PolicyId,
) -> Input {
  expect Some(oracle_input) =
    inputs
      |> list.find(
          fn(ref_input: Input) {
            quantity_of(ref_input.output.value, oracle_nft, "") == 1
          },
        )
  oracle_input
}

pub fn check_mint_redeemer_is_burn(
  mint_purpose: ScriptPurpose,
  redeemers: Pairs<ScriptPurpose, Redeemer>,
) -> Bool {
  expect Some(mint_redeemer_data) = redeemers |> pairs.get_first(mint_purpose)
  expect mint_redeemer: IntentRedeemer = mint_redeemer_data

  when mint_redeemer is {
    BurnIntent -> True
    _ -> False
  }
}

pub fn withdrawal_script_validated(
  withdrawals: Pairs<Credential, Lovelace>,
  withdrawal_script_hash: ScriptHash,
) -> Bool {
  withdrawals
    |> has_key(Script(withdrawal_script_hash))
}

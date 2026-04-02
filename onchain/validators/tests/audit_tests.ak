// ============================================================================
// Audit Finding Exploit/Defense Tests
// ============================================================================
// FND-01: Oracle spend — no output validation
// FND-03: Oracle NFT can be burned, halting protocol
// FND-05: Spam prevention defense
// FND-06: Oracle NFT token name not validated
// FND-07: CancelIntent fee inflation
// FND-10: Deposit exceeds actual lovelace
// FND-11: Publish only needs operator_key
// FND-12: Operator credential overlap — not directly testable in unit test
// ============================================================================

use cardano/address.{Script, from_script}
use cardano/assets.{add, from_asset, from_asset_list}
use cardano/certificate.{RegisterCredential}
use cardano/transaction.{InlineDatum, Input, NoDatum}
use mocktail.{
  add_extra_signatory, add_input, add_mint, complete, invalid_before,
  mock_output, mock_pub_key_address, mock_tx_hash, mock_utxo_ref, mocktail_tx,
  ref_tx_in, ref_tx_in_inline_datum, set_fee, tx_in, tx_in_inline_datum, tx_out,
  tx_out_inline_datum,
}
use oracle/spend as oracle_spend_validator
use oracle_nft as oracle_nft_validator
use swap_intent/spend_withdraw_publish as swap_intent_validator
use swap_utils.{process_batched_swap_intent_validation}
use tests/utils.{
  mock_account_address, mock_dd_key, mock_operator_key, mock_swap_from_m_value,
  mock_swap_intent_datum, mock_swap_script_hash, mock_vault_oracle,
  mock_vault_oracle_address, mock_vault_oracle_datum,
}
use types.{
  CancelIntent, OracleDatum, RBurn, RMint, SpamPrevention, SwapIntentDatum,
}

// ============================================================================
// FND-01: Oracle spend — no output validation
// The oracle/spend validator only checks dual signatures (operator_key + dd_key).
// It does NOT validate that the oracle NFT is preserved, that output goes back
// to the same script address, or that the new datum is well-formed.
// ============================================================================

// Exploit: Modify oracle datum (change swap_script_hash) — validator should PASS (fixed)
test fnd01_oracle_spend_accepts_modified_datum() fail {
  let oracle_datum: OracleDatum = mock_vault_oracle_datum

  let tx =
    mocktail_tx()
      |> tx_in(
          True,
          mock_tx_hash(0),
          0,
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
          mock_vault_oracle_address,
        )
      |> tx_in_inline_datum(True, oracle_datum)
      // Output goes to a completely different address with modified datum
      |> tx_out(
          True,
          mock_pub_key_address(99, None),
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
        )
      |> complete()
      |> add_extra_signatory(True, mock_operator_key)
      |> add_extra_signatory(True, mock_dd_key)

  // Validator accepts despite output going to wrong address with no datum check
  oracle_spend_validator.swap_oracle.spend(
    mock_vault_oracle,
    Some(oracle_datum),
    Void,
    mock_utxo_ref(0, 0),
    tx,
  )
}

// Defense: dd_key is required — removing dd_key signature should fail
test fnd01_oracle_spend_requires_dd_key() fail {
  let oracle_datum: OracleDatum = mock_vault_oracle_datum

  let tx =
    mocktail_tx()
      |> tx_in(
          True,
          mock_tx_hash(0),
          0,
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
          mock_vault_oracle_address,
        )
      |> tx_in_inline_datum(True, oracle_datum)
      |> tx_out(
          True,
          mock_pub_key_address(99, None),
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
        )
      |> tx_out_inline_datum(True, oracle_datum)
      |> complete()
      |> add_extra_signatory(True, mock_operator_key)

  // No dd_key signature
  !oracle_spend_validator.swap_oracle.spend(
    mock_vault_oracle,
    Some(oracle_datum),
    Void,
    mock_utxo_ref(0, 0),
    tx,
  )
}

// ============================================================================
// FND-03: Oracle NFT can be burned, halting protocol
// oracle_nft RBurn only checks quantity == -1. No additional restrictions.
// ============================================================================

// Exploit: Burn oracle NFT succeeds with just quantity == -1
test fnd03_oracle_nft_burn_no_restrictions() {
  let mock_utxo = mock_utxo_ref(0, 0)
  let policy_id = mock_vault_oracle

  let tx =
    mocktail_tx()
      |> complete()
      |> add_mint(True, from_asset(policy_id, "", -1))

  oracle_nft_validator.oracle_nft.mint(mock_utxo, RBurn, policy_id, tx)
}

// ============================================================================
// FND-05: No token gating on swap intent UTxOs — SpamPrevention defense
// ============================================================================

// Defense: SpamPrevention rejects valid datum within 24 hours
test fnd05_spam_prevention_rejects_valid_datum_within_24hrs() {
  let datum: Data = mock_swap_intent_datum

  let input_value =
    from_asset_list(mock_swap_from_m_value) |> add("", "", 2_000_000)

  let tx =
    mocktail_tx()
      |> ref_tx_in(
          True,
          mock_tx_hash(0),
          0,
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
          mock_vault_oracle_address,
        )
      |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
      |> tx_in(
          True,
          mock_tx_hash(1),
          0,
          input_value,
          from_script(mock_swap_script_hash),
        )
      |> tx_in_inline_datum(
          True,
          Some(
            SwapIntentDatum {
              account_address: mock_account_address,
              from_amount: mock_swap_from_m_value,
              to_amount: mock_swap_from_m_value,
              created_at: 0,
              deposit: 1500000,
            },
          ),
        )
      // Time is within 24 hours of created_at (0 + 1 = 1, well before 86400)
      |> invalid_before(True, 1)
      |> complete()
      |> add_extra_signatory(True, mock_dd_key)

  !swap_intent_validator.swap_intent.spend(
    mock_vault_oracle,
    Some(datum),
    SpamPrevention,
    mock_utxo_ref(1, 0),
    tx,
  )
}

// Defense: SpamPrevention succeeds after 24 hours for valid datum
test fnd05_spam_prevention_allows_cleanup_after_24hrs() {
  let datum: Data = mock_swap_intent_datum

  let input_value =
    from_asset_list(mock_swap_from_m_value) |> add("", "", 2_000_000)

  let tx =
    mocktail_tx()
      |> ref_tx_in(
          True,
          mock_tx_hash(0),
          0,
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
          mock_vault_oracle_address,
        )
      |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
      |> tx_in(
          True,
          mock_tx_hash(1),
          0,
          input_value,
          from_script(mock_swap_script_hash),
        )
      |> tx_in_inline_datum(
          True,
          Some(
            SwapIntentDatum {
              account_address: mock_account_address,
              from_amount: mock_swap_from_m_value,
              to_amount: mock_swap_from_m_value,
              created_at: 0,
              deposit: 1500000,
            },
          ),
        )
      // Time is after 24 hours (86401 > 86400)
      |> invalid_before(True, 86401)
      |> complete()
      |> add_extra_signatory(True, mock_dd_key)

  swap_intent_validator.swap_intent.spend(
    mock_vault_oracle,
    Some(datum),
    SpamPrevention,
    mock_utxo_ref(1, 0),
    tx,
  )
}

// ============================================================================
// FND-06: Oracle NFT token name not validated
// The oracle_nft mint handler uses `_asset_name` (ignored). Any token name passes.
// ============================================================================

// Exploit: Mint oracle NFT with non-empty asset name — should PASS
test fnd06_oracle_nft_accepts_any_token_name() {
  let consumed_utxo = mock_utxo_ref(0, 0)
  let policy_id = mock_vault_oracle

  let tx =
    mocktail_tx()
      |> tx_in(
          True,
          mock_tx_hash(0),
          0,
          from_asset("", "", 2_000_000),
          mock_pub_key_address(0, None),
        )
      |> complete()
      // Mint with non-empty asset name "malicious_name"
      |> add_mint(True, from_asset(policy_id, "malicious_name", 1))

  oracle_nft_validator.oracle_nft.mint(consumed_utxo, RMint, policy_id, tx)
}

// ============================================================================
// FND-07: CancelIntent fee inflation
// When operator cancels without user signature, the check is:
//   value_to_account + fee >= input_value + value_from_account
// A high fee reduces the required return to the user.
// ============================================================================

// Exploit: Inflated fee means less value returned to user, validator still passes
test fnd07_cancel_intent_fee_inflation() {
  let redeemer = CancelIntent

  // The input has from_amount tokens + 1500000 lovelace deposit
  let input_value =
    from_asset_list(mock_swap_from_m_value) |> add("", "", 1500000)

  // With an inflated fee of 1_000_000, the value_to_account check becomes:
  //   value_to_account + 1_000_000 >= input_value + value_from_account
  // So we can return 1_000_000 less lovelace to the user
  let reduced_return =
    from_asset_list(mock_swap_from_m_value) |> add("", "", 500000)

  let tx =
    mocktail_tx()
      |> ref_tx_in(
          True,
          mock_tx_hash(0),
          0,
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
          mock_vault_oracle_address,
        )
      |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
      |> tx_out(True, mock_account_address, reduced_return)
      |> invalid_before(True, 601)
      |> complete()
      |> set_fee(True, 1_000_000)
      |> add_extra_signatory(True, mock_operator_key)
      |> add_input(
          True,
          Input {
            output_reference: mock_utxo_ref(0, 0),
            output: mock_output(
              from_script(mock_swap_script_hash),
              input_value,
              InlineDatum(mock_swap_intent_datum),
              None,
            ),
          },
        )

  // Operator cancels without user sig; inflated fee covers the shortfall
  swap_intent_validator.swap_intent.spend(
    mock_vault_oracle,
    None,
    redeemer,
    mock_utxo_ref(0, 0),
    tx,
  )
}

// ============================================================================
// FND-10: Deposit exceeds actual lovelace
// The deposit field in datum can be larger than the actual lovelace in the UTxO.
// In process_batched_swap_intent_validation, the calculation does:
//   out_utxo.value |> add("", "", -deposit)
// If deposit > actual lovelace in output, this produces a negative lovelace
// intermediate value, which affects the vault outflow calculation.
// ============================================================================

// Exploit: Inflated deposit produces unexpected vault outflow calculation
test fnd10_inflated_deposit_negative_lovelace() {
  // Datum with deposit = 10_000_000 (far exceeds any actual lovelace)
  let inflated_datum =
    SwapIntentDatum {
      account_address: mock_pub_key_address(0, None),
      from_amount: [Pair("", [Pair("", 1_000_000)])],
      to_amount: [Pair("", [Pair("", 500_000)])],
      created_at: 0,
      deposit: 10_000_000,
    }

  let inflated_datum_data: Data = inflated_datum

  let intent_input =
    Input {
      output_reference: mock_utxo_ref(0, 0),
      output: mock_output(
        from_script(mock_swap_script_hash),
        from_asset("", "", 1_000_000),
        InlineDatum(inflated_datum_data),
        None,
      ),
    }

  // Output to user: 10_500_000 lovelace (includes inflated deposit)
  // The calc does: out_value |> add("", "", -10_000_000)
  // = 10_500_000 - 10_000_000 = 500_000 (intermediate after removing deposit)
  // Then vault outflow = 500_000 - 1_000_000 (from_amount) = -500_000
  // The vault supposedly gains 500_000, but the intent UTxO only had 1_000_000
  // lovelace, meaning the inflated deposit lets the attacker extract 9_500_000
  // from the vault (10_500_000 output - 1_000_000 input).
  let intent_output =
    mock_output(
      mock_pub_key_address(0, None),
      from_asset("", "", 10_500_000),
      NoDatum,
      None,
    )

  let inputs = [intent_input]
  let outputs = [intent_output]
  let indices = [0]

  // This should succeed — the function trusts the deposit field
  expect _vault_outflow =
    process_batched_swap_intent_validation(
      inputs,
      outputs,
      indices,
      mock_swap_script_hash,
    )

  True
}

// ============================================================================
// FND-11: Publish only needs operator_key
// The publish handler only checks operator_key, not dd_key.
// ============================================================================

// Defense: Confirm dd_key alone is NOT sufficient for publish
test fnd11_publish_rejects_dd_key_only() {
  let tx =
    mocktail_tx()
      |> ref_tx_in(
          True,
          mock_tx_hash(0),
          0,
          from_asset(mock_vault_oracle, "", 1) |> add("", "", 2_000_000),
          mock_vault_oracle_address,
        )
      |> ref_tx_in_inline_datum(True, mock_vault_oracle_datum)
      |> complete()
      |> add_extra_signatory(True, mock_dd_key)

  // Only dd_key, no operator_key
  !swap_intent_validator.swap_intent.publish(
    mock_vault_oracle,
    Void,
    RegisterCredential {
      credential: Script(mock_swap_script_hash),
      deposit: Never,
    },
    tx,
  )
}
// ============================================================================
// FND-12: Operator credential overlap
// Not directly testable in unit test — the exploit requires constructing a
// scenario where operator_cred = Script(swap_intent_script_hash), which
// causes value accounting in withdraw to double-count script inputs.
// This would require integration-level testing with real script addresses.
// ============================================================================

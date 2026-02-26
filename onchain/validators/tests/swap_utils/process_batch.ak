use cardano/address.{from_script}
use cardano/assets.{add, from_asset_list, merge}
use cardano/transaction.{InlineDatum, Input, NoDatum}
use mocktail.{mock_output, mock_pub_key_address, mock_utxo_ref}
use swap_utils.{
  calculate_vault_net_outflow, process_batched_swap_intent_validation,
}
use tests/utils.{mock_created_at, mock_swap_script_hash}
use types.{SwapIntentDatum}

pub const m_value_a_from = [Pair("", [Pair("", 1000000)])]

const m_value_a_to =
  [
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 1000000)],
    ),
  ]

const swap_intent_datum_a: Data =
  SwapIntentDatum {
    account_address: mock_pub_key_address(0, None),
    from_amount: m_value_a_from,
    to_amount: m_value_a_to,
    created_at: mock_created_at,
    deposit: 1500000,
  }

pub const intent_output_value_a =
  from_asset_list(
    [
      Pair(
        #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
        [Pair(#"5553444d", 1100000)],
      ),
    ],
  )
    |> add("", "", 1500000)

pub const intent_input_a =
  Input {
    output_reference: mock_utxo_ref(0, 0),
    output: mock_output(
      from_script(mock_swap_script_hash),
      from_asset_list(m_value_a_from),
      InlineDatum(swap_intent_datum_a),
      None,
    ),
  }

pub const intent_output_a =
  mock_output(
    mock_pub_key_address(0, None),
    intent_output_value_a,
    NoDatum,
    None,
  )

pub const m_value_b_from =
  [
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 1000000)],
    ),
  ]

const m_value_b_to = [Pair("", [Pair("", 1000000)])]

const swap_intent_datum_b: Data =
  SwapIntentDatum {
    account_address: mock_pub_key_address(1, None),
    from_amount: m_value_b_from,
    to_amount: m_value_b_to,
    created_at: mock_created_at,
    deposit: 1500000,
  }

pub const intent_output_value_b =
  from_asset_list([Pair("", [Pair("", 1100000)])]) |> add("", "", 1500000)

pub const intent_input_b =
  Input {
    output_reference: mock_utxo_ref(1, 0),
    output: mock_output(
      from_script(mock_swap_script_hash),
      from_asset_list(m_value_b_from),
      InlineDatum(swap_intent_datum_b),
      None,
    ),
  }

pub const intent_output_b =
  mock_output(
    mock_pub_key_address(1, None),
    intent_output_value_b,
    NoDatum,
    None,
  )

pub const m_value_c_from =
  [
    Pair("", [Pair("", 1000000)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 1000000)],
    ),
  ]

const m_value_c_to =
  [
    Pair("", [Pair("", 1000000)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 1000000)],
    ),
  ]

const swap_intent_datum_c: Data =
  SwapIntentDatum {
    account_address: mock_pub_key_address(2, None),
    from_amount: m_value_c_from,
    to_amount: m_value_c_to,
    created_at: mock_created_at,
    deposit: 1500000,
  }

pub const intent_output_value_c =
  from_asset_list(
    [
      Pair("", [Pair("", 1100000)]),
      Pair(
        #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
        [Pair(#"5553444d", 1100000)],
      ),
    ],
  )
    |> add("", "", 1500000)

pub const intent_input_c =
  Input {
    output_reference: mock_utxo_ref(2, 0),
    output: mock_output(
      from_script(mock_swap_script_hash),
      from_asset_list(m_value_c_from),
      InlineDatum(swap_intent_datum_c),
      None,
    ),
  }

pub const intent_output_c =
  mock_output(
    mock_pub_key_address(2, None),
    intent_output_value_c,
    NoDatum,
    None,
  )

const input_x =
  Input {
    output_reference: mock_utxo_ref(999, 0),
    output: mock_output(
      mock_pub_key_address(999, None),
      from_asset_list([Pair("", [Pair("", 1000000)])]),
      NoDatum,
      None,
    ),
  }

const input_y =
  Input {
    output_reference: mock_utxo_ref(999, 1),
    output: mock_output(
      mock_pub_key_address(999, None),
      from_asset_list([Pair("", [Pair("", 1000000)])]),
      NoDatum,
      None,
    ),
  }

const inputs =
  [input_x, intent_input_a, intent_input_b, input_y, intent_input_c]

const excessive_inputs =
  [
    input_x, intent_input_a, intent_input_b, input_y, intent_input_c,
    intent_input_c,
  ]

const insufficient_inputs = [input_x, intent_input_a, intent_input_b, input_y]

const outputs = [intent_output_b, intent_output_a, intent_output_c]

const incorrect_outputs = [intent_output_a, intent_output_b, intent_output_c]

const indices = [1, 0, 2]

const incorrect_indices = [0, 1, 2]

const excessive_indices = [0, 1, 2, 3]

test process_batch_normal() {
  process_batched_swap_intent_validation(
    inputs,
    outputs,
    indices,
    mock_swap_script_hash,
  ) == (
    calculate_vault_net_outflow(
      m_value_a_from,
      intent_output_value_a |> add("", "", -1500000),
    )
      |> merge(
          calculate_vault_net_outflow(
            m_value_b_from,
            intent_output_value_b |> add("", "", -1500000),
          ),
        )
      |> merge(
          calculate_vault_net_outflow(
            m_value_c_from,
            intent_output_value_c |> add("", "", -1500000),
          ),
        )
  )
}

test process_batch_excessive_inputs() fail {
  process_batched_swap_intent_validation(
    excessive_inputs,
    outputs,
    indices,
    mock_swap_script_hash,
  ) == (
    calculate_vault_net_outflow(
      m_value_a_from,
      intent_output_value_a |> add("", "", -1500000),
    )
      |> merge(
          calculate_vault_net_outflow(m_value_b_from, intent_output_value_b)
            |> add("", "", -1500000),
        )
      |> merge(
          calculate_vault_net_outflow(
            m_value_c_from,
            intent_output_value_c |> add("", "", -1500000),
          ),
        )
  )
}

test process_batch_insufficient_inputs() fail {
  process_batched_swap_intent_validation(
    insufficient_inputs,
    outputs,
    indices,
    mock_swap_script_hash,
  ) == (
    calculate_vault_net_outflow(
      m_value_a_from,
      intent_output_value_a |> add("", "", -1500000),
    )
      |> merge(
          calculate_vault_net_outflow(
            m_value_b_from,
            intent_output_value_b |> add("", "", -1500000),
          ),
        )
      |> merge(
          calculate_vault_net_outflow(
            m_value_c_from,
            intent_output_value_c |> add("", "", -1500000),
          ),
        )
  )
}

test process_batch_incorrect_outputs() fail {
  process_batched_swap_intent_validation(
    inputs,
    incorrect_outputs,
    indices,
    mock_swap_script_hash,
  ) == (
    calculate_vault_net_outflow(
      m_value_a_from,
      intent_output_value_a |> add("", "", -1500000),
    )
      |> merge(
          calculate_vault_net_outflow(
            m_value_b_from,
            intent_output_value_b |> add("", "", -1500000),
          ),
        )
      |> merge(
          calculate_vault_net_outflow(
            m_value_c_from,
            intent_output_value_c |> add("", "", -1500000),
          ),
        )
  )
}

test process_batch_incorrect_indices() fail {
  process_batched_swap_intent_validation(
    inputs,
    outputs,
    incorrect_indices,
    mock_swap_script_hash,
  ) == (
    calculate_vault_net_outflow(
      m_value_a_from,
      intent_output_value_a |> add("", "", -1500000),
    )
      |> merge(
          calculate_vault_net_outflow(
            m_value_b_from,
            intent_output_value_b |> add("", "", -1500000),
          ),
        )
      |> merge(
          calculate_vault_net_outflow(
            m_value_c_from,
            intent_output_value_c |> add("", "", -1500000),
          ),
        )
  )
}

test process_batch_excessive_indices() fail {
  process_batched_swap_intent_validation(
    inputs,
    outputs,
    excessive_indices,
    mock_swap_script_hash,
  ) == (
    calculate_vault_net_outflow(
      m_value_a_from,
      intent_output_value_a |> add("", "", -1500000),
    )
      |> merge(
          calculate_vault_net_outflow(
            m_value_b_from,
            intent_output_value_b |> add("", "", -1500000),
          ),
        )
      |> merge(
          calculate_vault_net_outflow(
            m_value_c_from,
            intent_output_value_c |> add("", "", -1500000),
          ),
        )
  )
}

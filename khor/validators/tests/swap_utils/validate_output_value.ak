use cardano/assets.{from_asset_list}
use swap_utils.{validate_minimum_output_value}

const m_value_a =
  [
    Pair("", [Pair("", 100)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 100)],
    ),
  ]

const m_value_a_output_value =
  from_asset_list(
    [
      Pair("", [Pair("", 100)]),
      Pair(
        #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
        [Pair(#"5553444d", 100)],
      ),
    ],
  )

const m_value_a_output_value_extra =
  from_asset_list(
    [
      Pair("", [Pair("", 100)]),
      Pair(
        #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
        [Pair(#"5553444d", 200)],
      ),
    ],
  )

const m_value_a_output_value_less =
  from_asset_list(
    [
      Pair("", [Pair("", 100)]),
      Pair(
        #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
        [Pair(#"5553444d", 50)],
      ),
    ],
  )

const m_value_b =
  [
    Pair("", [Pair("", 100)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair("", 100), Pair(#"5553444d", 100)],
    ),
  ]

const m_value_b_output_value = from_asset_list(m_value_b)

test validate_minimum_output_value_a() {
  validate_minimum_output_value(m_value_a_output_value, m_value_a) == True
}

test validate_minimum_output_value_a_extra() {
  validate_minimum_output_value(m_value_a_output_value_extra, m_value_a) == True
}

test validate_minimum_output_value_a_less() {
  validate_minimum_output_value(m_value_a_output_value_less, m_value_a) == False
}

test validate_minimum_output_value_b() {
  validate_minimum_output_value(m_value_b_output_value, m_value_b) == True
}

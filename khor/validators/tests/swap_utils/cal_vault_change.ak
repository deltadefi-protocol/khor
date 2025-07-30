use cardano/assets.{from_asset_list}
use swap_utils.{cal_vault_change}

const m_value_a =
  [
    Pair("", [Pair("", 100)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 100)],
    ),
  ]

const m_value_b =
  [
    Pair("", [Pair("", -200)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 200)],
    ),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c999",
      [Pair(#"5553444d", 0)],
    ),
  ]

const m_value_b_output =
  [
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 200)],
    ),
  ]

const m_value_c =
  [
    Pair("", [Pair("", -200)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"", -10), Pair(#"5553444d", 200)],
    ),
  ]

const m_value_c_output =
  [
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 200)],
    ),
  ]

const m_value_d =
  [
    Pair("", [Pair("", -200)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"", 0), Pair(#"5553444d", 200)],
    ),
  ]

const m_value_d_output =
  [
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 200)],
    ),
  ]

test cal_a() {
  cal_vault_change(m_value_a) == from_asset_list(m_value_a)
}

test cal_b() {
  cal_vault_change(m_value_b) == from_asset_list(m_value_b_output)
}

test cal_c() {
  cal_vault_change(m_value_c) == from_asset_list(m_value_c_output)
}

test cal_d() {
  cal_vault_change(m_value_d) == from_asset_list(m_value_d_output)
}

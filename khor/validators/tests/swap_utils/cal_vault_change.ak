use cardano/assets.{from_asset_list, merge, zero}
use swap_utils.{calculate_vault_change}

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
    Pair("", [Pair("", 200)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 200)],
    ),
  ]

const b_output =
  from_asset_list(
    [
      Pair(
        #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
        [Pair(#"5553444d", 200)],
      ),
    ],
  )

const b_change = from_asset_list([Pair("", [Pair("", -200)])])

const m_value_c =
  [
    Pair("", [Pair("", 200)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair("", 200), Pair(#"5553444d", 200)],
    ),
  ]

const c_output =
  from_asset_list(
    [
      Pair(
        #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
        [Pair(#"5553444d", 200)],
      ),
    ],
  )

const c_change =
  from_asset_list(
    [
      Pair("", [Pair("", -200)]),
      Pair(
        #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
        [Pair("", -200)],
      ),
    ],
  )

test cal_a() {
  calculate_vault_change(m_value_a, from_asset_list(m_value_a)) == zero
}

test cal_b() {
  calculate_vault_change(m_value_b, b_output) == b_change
}

test cal_c() {
  calculate_vault_change(m_value_c, c_output) == c_change
}

test change_check() {
  let value_from_vault =
    from_asset_list(
      [
        Pair("", [Pair("", 200)]),
        Pair(
          #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
          [Pair("", 200)],
        ),
      ],
    )

  let value_to_vault =
    from_asset_list(
      [
        Pair("", [Pair("", 100)]),
        Pair(
          #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
          [Pair("", 300)],
        ),
      ],
    )

  let change =
    from_asset_list(
      [
        Pair("", [Pair("", 100)]),
        Pair(
          #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
          [Pair("", -100)],
        ),
      ],
    )

  merge(change, value_to_vault) == value_from_vault
}

use swap_utils.{subtract_m_value}
use types.{MValue}

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

const m_value_a_and_b =
  [
    Pair("", [Pair("", -100)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", -100)],
    ),
  ]

const m_value_a_and_b_wrong =
  [
    Pair("", [Pair("", 100)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair(#"5553444d", 100)],
    ),
  ]

const m_value_c =
  [
    Pair("", [Pair("", 300)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair("", 300), Pair(#"5553444d", 300)],
    ),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c999",
      [Pair(#"5553444d", 300)],
    ),
  ]

const m_value_a_and_b_and_c =
  [
    Pair("", [Pair("", 400)]),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c913",
      [Pair("", 300), Pair(#"5553444d", 400)],
    ),
    Pair(
      #"c69b981db7a65e339a6d783755f85a2e03afa1cece9714c55fe4c999",
      [Pair(#"5553444d", 300)],
    ),
  ]

const empty_m_value: MValue = []

test substract_a_and_b() {
  subtract_m_value(m_value_a, m_value_b) == m_value_a_and_b
}

test substract_a_and_b_wrong() {
  subtract_m_value(m_value_a, m_value_b) != m_value_a_and_b_wrong
}

test substract_a_and_b_and_c() {
  (subtract_m_value(m_value_c, m_value_a_and_b) == m_value_a_and_b_and_c)?
}

test substract_empty_and_a() {
  subtract_m_value(m_value_a, empty_m_value) == m_value_a
}

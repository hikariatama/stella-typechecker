export const defaultCode = `language core;

extend with #universal-types;

generic fn identity[T](value : T) -> T {
  return value
}

generic fn keep_left[X](value : X) -> forall Y. fn(Y) -> X {
  return generic [Y] fn(other : Y) {
    return value
  }
}

fn main(value : Nat) -> Nat {
  return keep_left[Nat](identity[Nat](value))[Bool](false)
}
`;

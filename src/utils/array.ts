export const minBy = function <T extends any>(arr: T[], fn: (item: T) => number) {
  return extremumBy(arr, fn, Math.min)
}

export const maxBy = function <T extends any>(arr: T[], fn: (item: T) => number) {
  return extremumBy(arr, fn, Math.max)
}

const extremumBy = function <T extends any>(
  arr: T[],
  pluck: (item: T) => number,
  extremum: (...arr: number[]) => any
) {
  const reduced = arr.reduce<[number, T] | undefined>(function (best, next) {
    var pair = [pluck(next), next] as [number, T]
    if (!best) {
      return pair
    } else if (extremum.apply(null, [best[0], pair[0]]) == best[0]) {
      return best
    } else {
      return pair
    }
  }, undefined)

  if (reduced) {
    return reduced[1]
  }
}

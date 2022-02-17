export async function findAsyncSequential<T, U>(
  array: T[],
  predicate: (element: T) => Promise<U | undefined>
): Promise<U | undefined> {
  for (const element of array) {
    const result = await predicate(element)
    if (result) {
      return result
    }
  }
  return undefined
}

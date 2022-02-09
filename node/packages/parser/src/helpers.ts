export async function findAsyncSequential<T, U>(
  array: T[],
  predicate: (element: T) => Promise<U>
): Promise<T | undefined> {
  for (const element of array) {
    if (await predicate(element)) {
      return element
    }
  }
  return undefined
}

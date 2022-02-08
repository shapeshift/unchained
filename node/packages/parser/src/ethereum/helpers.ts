import { Tx } from '@shapeshiftoss/blockbook'

export const txInteractsWithContract = (tx: Tx, contract: string) => {
  const receiveAddress = tx.vout[0].addresses?.[0] ?? ''
  return receiveAddress === contract
}

export async function findAsyncSequential<T>(
  array: T[],
  predicate: (element: T) => Promise<boolean>
): Promise<T | undefined> {
  for (const element of array) {
    if (await predicate(element)) {
      return element
    }
  }
  return undefined
}

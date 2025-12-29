export type RpcResponse<T> = {
  jsonrpc: string
  id: number
  result: T
  error?: { code: number; message: string }
}

export type TokenListResponse = {
  errno: number
  message: string
  data: {
    items: Array<{ address: string; symbol: string }>
    total: number
  }
}

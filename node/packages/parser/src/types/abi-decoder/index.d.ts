declare module 'abi-decoder' {
  export namespace ABI {
    export type Type = 'function' | 'constructor' | 'event' | 'fallback' | 'receive'
    export type StateMutabilityType = 'pure' | 'view' | 'nonpayable' | 'payable'

    export interface Item {
      type: Type
      anonymous?: boolean
      constant?: boolean
      gas?: number
      inputs?: Input[]
      name?: string
      outputs?: Output[]
      payable?: boolean
      stateMutability?: StateMutabilityType
    }

    export interface Input {
      name: string
      type: string
      indexed?: boolean
      components?: Input[]
      internalType?: string
    }

    export interface Output {
      name: string
      type: string
      components?: Output[]
      internalType?: string
    }
  }

  export interface DecodedMethod {
    name: string
    params: DecodedMethodParam[]
  }

  export interface DecodedMethodParam {
    name: string
    type: string
    value?: never
  }

  export interface LogItem {
    transactionIndex: string
    logIndex: string
    blockNumber: string
    transactionHash: string
    blockHash: string
    data: string
    topics: string[]
    address: string
  }

  export interface DecodedLogs {
    name: string | undefined
    events: DecodedMethodParam[] | undefined
    address: string
  }

  export declare function getABIs(): ABI.Item[]
  export declare function addABI(items: ABI.Item[]): void
  export declare function removeABI(items: ABI.Item[]): void
  export declare function getMethodIDs(): Map<string, ABI.Item>
  export declare function decodeMethod(data: string): DecodedMethod | undefined
  export declare function decodeLogs(logs: LogItem[]): Array<DecodedLogs | undefined>
}

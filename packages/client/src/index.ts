import * as BitcoinAPI from './generated/bitcoin'
import * as EthereumAPI from './generated/ethereum'

import { Client as EthereumWS } from '@shapeshiftoss/ethereum-api/src/websocket/client'

export const Bitcoin = { ...BitcoinAPI }
export const Ethereum = { ...EthereumAPI, WS: EthereumWS }

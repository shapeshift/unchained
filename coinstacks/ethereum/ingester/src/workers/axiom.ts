import { BigNumber } from 'bignumber.js'
import { Message, TransactionType, Worker } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { ETHParseTx } from '../types'

export interface AxiomTx {
  source: string
  balance_change: string
  balance_units: string
  blockheight: number
  blocktime: number
  confirmations: number
  is_dex_trade: boolean
  is_thor_trade?: boolean
  network: string
  success: boolean
  symbol: string
  thor_memo?: string
  txid: string
  type: TransactionType
  xpub?: string
  buy_asset?: string
  buy_asset_amount?: string
  buy_asset_network?: string
  fee_asset?: string
  fee_network?: string
  network_fee?: string
  liquidity_fee?: string
  sell_asset?: string
  sell_asset_amount?: string
  sell_asset_network?: string
  token_contract_address?: string
  token_decimals?: number
  token_name?: string
}

type TxBase =
  | 'source'
  | 'balance_units'
  | 'blockheight'
  | 'blocktime'
  | 'confirmations'
  | 'is_dex_trade'
  | 'is_thor_trade'
  | 'network'
  | 'success'
  | 'txid'
  | 'xpub'

export const format = (pTx: ETHParseTx): Array<AxiomTx> => {
  const aTxBase: Pick<AxiomTx, TxBase> = {
    source: 'unchained',
    balance_units: 'wei',
    blockheight: pTx.blockHeight,
    blocktime: pTx.blockTime,
    confirmations: pTx.confirmations,
    network: 'ETH',
    is_dex_trade: false,
    success: pTx.ethereumSpecific?.status === 0 ? false : true,
    txid: pTx.txid,
    xpub: pTx.document?.registration.pubkey,
  }

  const selfSend = [...new Set([...Object.keys(pTx.send), ...Object.keys(pTx.receive)])].every(
    (symbol) => pTx.send[symbol]?.totalValue === pTx.receive[symbol]?.totalValue
  )

  const aTxs: Array<AxiomTx> = []

  // combine fee with eth total value or track fee separately if not eth
  if (pTx.fee) {
    if (pTx.send['ETH'] && !selfSend) {
      const totalValue = new BigNumber(pTx.send['ETH'].totalValue).plus(new BigNumber(pTx.fee?.value ?? 0)).toString(10)
      pTx.send['ETH'].totalValue = totalValue
    } else {
      aTxs.push({
        ...aTxBase,
        balance_change: `-${pTx.fee.value}`,
        symbol: pTx.fee.symbol,
        type: 'fee',
      })
    }
  }

  // track any send or receive transfers
  const types: Array<'send' | 'receive'> = ['send', 'receive']
  types.forEach((type) => {
    aTxs.push(
      ...Object.entries(pTx[type]).reduce<Array<AxiomTx>>((prev, [symbol, transfer]) => {
        if (selfSend) return prev

        // only add unique data to the receive side for the asset being received
        const trade = pTx.trade?.buyAsset === symbol && type === 'receive' ? pTx.trade : undefined
        const refund = pTx.refund?.refundAsset === symbol && type === 'receive' ? pTx.refund : undefined

        const aTx: AxiomTx = {
          ...aTxBase,
          balance_change: type === 'receive' ? transfer.totalValue : `-${transfer.totalValue}`,
          is_dex_trade: trade?.dexName === 'zrx',
          is_thor_trade: trade?.dexName === 'thor' ? true : undefined,
          symbol: symbol,
          type: type,
          token_contract_address: transfer.token?.contract,
          token_decimals: transfer.token?.decimals,
          token_name: transfer.token?.name,
          thor_memo: trade?.memo ?? refund?.memo,
          buy_asset: trade?.buyAsset ?? refund?.refundAsset,
          buy_asset_amount: trade?.buyAmount ?? refund?.refundAmount,
          buy_asset_network: trade?.buyNetwork ?? refund?.refundNetwork,
          fee_asset: trade?.feeAsset,
          fee_network: trade?.feeNetwork,
          network_fee: trade?.feeAmount,
          liquidity_fee: trade?.liquidityFee,
          sell_asset: trade?.sellAsset,
          sell_asset_amount: trade?.sellAmount,
          sell_asset_network: trade?.sellNetwork,
        }

        return [...prev, aTx]
      }, [])
    )
  })

  return aTxs
}

const onMessage = (worker: Worker) => async (message: Message) => {
  const pTx: ETHParseTx = message.getContent()

  try {
    const aTxs = format(pTx)

    // annotate message.properties.type as required by
    // https://github.com/CroixDrinkers/axiom/blob/master/projects/tx-workers/src/index.ts#L13
    aTxs.forEach((aTx) => worker.sendMessage(new Message(aTx, { type: 'event.platform.transaction' })))
    worker.ackMessage(message, pTx.txid)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, pTx.txid)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.ethereum.tx.axiom',
    exchangeName: 'exchange.watchtower.txs',
  })

  worker.queue?.prefetch(1)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()

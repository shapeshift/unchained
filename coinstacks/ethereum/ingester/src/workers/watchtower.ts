import { BigNumber } from 'bignumber.js'
import { Message, Worker } from '@shapeshiftoss/common-ingester'
import { logger } from '@shapeshiftoss/logger'
import { ETHParseTx } from '../types'

interface WatchtowerTx {
  account_id: number
  address_id: number
  balance_change: string
  block_hash?: string
  block_height: number
  block_time: number
  erc_20_token?: {
    contract_address: string
    name: string
    symbol: string
    precision: number
  }
  fee?: string
  is_dex_trade: boolean
  is_erc_20_fee: boolean
  is_erc_20_token_transfer: boolean
  success: boolean
  thor_memo?: string
  txid: string
}

type TxBase =
  | 'account_id'
  | 'address_id'
  | 'block_hash'
  | 'block_height'
  | 'block_time'
  | 'is_dex_trade'
  | 'success'
  | 'txid'

export const format = (pTx: ETHParseTx): Array<WatchtowerTx> => {
  const wTxs: Array<WatchtowerTx> = []

  if (!pTx.document?.watchtower_meta.tracker_account_id) {
    logger.error('format.error: watchtower account_id required:', JSON.stringify(pTx, null, 2))
    return wTxs
  }

  if (!pTx.document?.watchtower_meta.tracker_address_ids?.[pTx.address.toLowerCase()]) {
    logger.error('format.error: watchtower address_id required:', JSON.stringify(pTx, null, 2))
    return wTxs
  }

  const wTxBase: Pick<WatchtowerTx, TxBase> = {
    account_id: pTx.document.watchtower_meta.tracker_account_id,
    address_id: pTx.document.watchtower_meta.tracker_address_ids[pTx.address],
    block_hash: pTx.blockHash,
    block_height: pTx.blockHeight,
    block_time: pTx.blockTime,
    is_dex_trade: false,
    success: pTx.ethereumSpecific?.status === 0 ? false : true,
    txid: pTx.txid,
  }

  // combine fee with eth total value or track fee separately if not eth
  if (pTx.fee) {
    if (pTx.send['ETH']) {
      const totalValue = new BigNumber(pTx.send['ETH'].totalValue).plus(new BigNumber(pTx.fee.value)).toString(10)
      pTx.send['ETH'].totalValue = totalValue
    } else {
      wTxs.push({
        ...wTxBase,
        balance_change: `-${pTx.fee.value}`,
        is_erc_20_fee: true,
        is_erc_20_token_transfer: false,
        fee: pTx.fee.value,
      })
    }
  }

  // track any send or receive transfers
  const types: Array<'send' | 'receive'> = ['send', 'receive']
  types.forEach((type) => {
    wTxs.push(
      ...Object.entries(pTx[type]).reduce<Array<WatchtowerTx>>((prev, [symbol, transfer]) => {
        const wTx: WatchtowerTx = {
          ...wTxBase,
          balance_change: type === 'receive' ? transfer.totalValue : `-${transfer.totalValue}`,
          is_dex_trade: pTx.trade?.dexName === 'zrx',
          is_erc_20_fee: false,
          is_erc_20_token_transfer: !!transfer.token,
          thor_memo: pTx.trade?.memo,
          ...(transfer.token && {
            erc_20_token: {
              contract_address: transfer.token.contract,
              name: transfer.token.name,
              symbol: symbol,
              precision: transfer.token.decimals,
            },
          }),
        }

        return [...prev, wTx]
      }, [])
    )
  })

  return wTxs
}

const onMessage = (worker: Worker) => async (message: Message) => {
  const pTx: ETHParseTx = message.getContent()

  try {
    const wTxs = format(pTx)

    wTxs.forEach((wTx) => worker.sendMessage(new Message(wTx), 'watchtower.tx.backfill'))
    worker.ackMessage(message, pTx.txid)
  } catch (err) {
    logger.error('onMessage.error:', err.isAxiosError ? err.message : err)
    worker.retryMessage(message, pTx.txid)
  }
}

const main = async () => {
  const worker = await Worker.init({
    queueName: 'queue.ethereum.tx.watchtower',
    exchangeName: 'exchange.watchtower',
  })

  worker.queue?.prefetch(1)
  worker.queue?.activateConsumer(onMessage(worker), { noAck: false })
}

main()

import { TxMetadata } from '../types'
import { Event, Message } from '../../generated/cosmos'
import { Logger } from '@shapeshiftoss/logger'

const logger = new Logger({
  namespace: ['client', 'cosmos', 'utils'],
  level: process.env.LOG_LEVEL,
})

export const metaData = (msg: Message, events: Event[], caip19: string): TxMetadata | undefined => {
  switch (msg.type) {
    case 'delegate':
    case 'begin_unbonding':
      return {
        parser: 'cosmos',
        method: msg.type,
        delegator: msg.from,
        destinationValidator: msg.to,
      }
    case 'begin_redelegate':
      return {
        parser: 'cosmos',
        method: msg.type,
        sourceValidator: msg.from,
        delegator: msg.origin,
        destinationValidator: msg.to,
      }
    case 'withdraw_delegator_reward':
      return {
        parser: 'cosmos',
        method: msg.type,
        destinationValidator: msg.to,
        value: getRewardValue(msg, events) ?? '0',
        caip19: caip19,
      }
    // ibc send
    case 'transfer':
      return {
        parser: 'cosmos',
        method: msg.type,
        caip19: caip19,
        ibcDestination: msg.to,
        value: msg.value?.amount ?? '0',
      }
    // known message types with no applicable metadata
    case 'send':
      return
    default:
      logger.warn(`unsupported message type: ${msg.type}`)
      return
  }
}

const getRewardValue = (msg: Message, events: Array<Event>): string => {
  const rewardEvent = events.find((event) => event.type === 'withdraw_rewards')

  if (!rewardEvent) {
    logger.warn('withdraw_rewards event not found')
    return '0'
  }

  const valueUnparsed = rewardEvent.attributes.find((attribute) => attribute.key === 'amount')?.value
  const validator = rewardEvent.attributes.find((attribute) => attribute.key === 'validator')?.value

  if (msg.from !== validator) {
    logger.warn('withdraw_rewards validator does not match')
    return '0'
  }

  if (!valueUnparsed) {
    logger.warn('withdraw_rewards value not found')
    return '0'
  }

  return valueUnparsed.slice(0, valueUnparsed.length - 'uatom'.length)
}

// Some txs dont have messages so we create a "virtual" message so it works with the rest of the parser
// ibc receives are the only case of this right now
export const getVirtualMsgFromEvents = (events: { [key: string]: Event[] }): Message | undefined => {
  const recvPacketEvent = events['1'].find((event) => event.type === 'recv_packet')
  // ibc receive
  if (recvPacketEvent) {
    return {
      type: 'ibc_virtual_receive',
    }
  } else {
    logger.warn('cant create virtual message from events')
    return undefined
  }
}

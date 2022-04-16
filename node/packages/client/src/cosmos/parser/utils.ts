import { TxMetadata } from '../types'
import { Event, Message } from '../../generated/cosmos'
import { Logger } from '@shapeshiftoss/logger'
import BigNumber from 'bignumber.js'

const logger = new Logger({
  namespace: ['client', 'cosmos', 'utils'],
  level: process.env.LOG_LEVEL,
})

export const valuesFromMsgEvents = (
  msg: Message,
  events: { [key: string]: Event[] },
  caip19: string
): { from: string; to: string; value: BigNumber; data: TxMetadata | undefined; origin: string } => {
  const virtualMsg = virtualMessageFromEvents(msg, events)
  const data = metaData(virtualMsg, caip19)
  const from = virtualMsg?.from ?? ''
  const to = virtualMsg?.to ?? ''
  const origin = virtualMsg?.origin ?? ''
  const value = new BigNumber(virtualMsg?.value?.amount || data?.value || 0)
  return { from, to, value, data, origin }
}

const metaData = (msg: Message | undefined, caip19: string): TxMetadata | undefined => {
  if (!msg) return
  switch (msg.type) {
    case 'delegate':
    case 'begin_unbonding':
      return {
        parser: 'cosmos',
        method: msg.type,
        delegator: msg.from,
        destinationValidator: msg.to,
        value: msg?.value?.amount,
      }
    case 'begin_redelegate':
      return {
        parser: 'cosmos',
        method: msg.type,
        sourceValidator: msg.from,
        delegator: msg.origin,
        destinationValidator: msg.to,
        value: msg?.value?.amount,
        caip19: caip19,
      }
    case 'withdraw_delegator_reward':
      return {
        parser: 'cosmos',
        method: msg.type,
        destinationValidator: msg.to,
        value: msg?.value?.amount,
        caip19: caip19,
      }
    case 'ibc_send':
    case 'ibc_receive':
      return {
        parser: 'cosmos',
        method: msg.type,
        ibcDestination: msg.to,
        ibcSource: msg.from,
        caip19: caip19,
        value: msg?.value?.amount,
      }
    // known message types with no applicable metadata
    case 'send':
      return
    default:
      logger.warn(`unsupported message type: ${msg.type}`)
      return
  }
}

const virtualMessageFromEvents = (msg: Message, events: { [key: string]: Event[] }): Message | undefined => {
  // ibc send tx indicated by events
  const ibcSendEventData = events[0]?.find((event) => event.type === 'send_packet')
  // ibc receive tx indicated by events
  const ibcRecvEventData = events[1]?.find((event) => event.type === 'recv_packet')
  // get rewards tx indicted by events
  const rewardEventData = events[0]?.find((event) => event.type === 'withdraw_rewards')

  if (ibcSendEventData) {
    const parsedPacketData = JSON.parse(
      ibcSendEventData?.attributes.find((attribute) => attribute.key === 'packet_data')?.value ?? '{}'
    )

    return {
      type: 'ibc_send',
      value: { amount: parsedPacketData.amount, denom: parsedPacketData.amount },
      from: parsedPacketData.sender,
      to: parsedPacketData.receiver,
      origin: parsedPacketData.sender,
    }
  } else if (ibcRecvEventData) {
    const parsedPacketData = JSON.parse(
      ibcRecvEventData?.attributes.find((attribute) => attribute.key === 'packet_data')?.value ?? '{}'
    )

    return {
      type: 'ibc_receive',
      value: { amount: parsedPacketData.amount, denom: parsedPacketData.amount },
      from: parsedPacketData.sender,
      to: parsedPacketData.receiver,
      origin: parsedPacketData.sender,
    }
  } else if (rewardEventData) {
    const valueUnparsed = rewardEventData?.attributes?.find((attribute) => attribute.key === 'amount')?.value
    const valueParsed = valueUnparsed?.slice(0, valueUnparsed.length - 'uatom'.length)
    return {
      type: 'withdraw_delegator_reward',
      value: { amount: valueParsed ?? '', denom: 'uatom' },
      from: msg.from,
      to: msg.to,
      origin: msg.origin,
    }
  } else {
    console.warn(`cant create virtual message from events ${events}`)
    return msg
  }
}

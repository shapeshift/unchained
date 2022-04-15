/* eslint-disable prettier/prettier */
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
  console.log('virtualMsg', virtualMsg)
  const data = metaData(virtualMsg, events, caip19)
  const from = virtualMsg?.from ?? ''
  const to = virtualMsg?.to ?? ''
  const origin = virtualMsg?.origin ?? ''
  const value = new BigNumber(virtualMsg?.value?.amount || data?.value || 0)
  return { from, to, value, data, origin }
}

const metaData = (
  msg: Message | undefined,
  events: { [key: string]: Event[] },
  caip19: string
): TxMetadata | undefined => {
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
        value: getRewardValue(msg, events) ?? '0',
        caip19: caip19,
      }
    case 'ibc_send':
      return {
        parser: 'cosmos',
        method: msg.type,
        ibcDestination: msg.to,
        ibcSource: msg.from,
        caip19: caip19,
        value: msg?.value?.amount,
      }
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

const getRewardValue = (msg: Message, events: { [key: string]: Event[] }): string => {
  const rewardEvent = events[0]?.find((event) => event.type === 'withdraw_rewards')

  if (!rewardEvent) {
    logger.warn('withdraw_rewards event not found')
    return '0'
  }

  const valueUnparsed = rewardEvent?.attributes?.find((attribute) => attribute.key === 'amount')?.value
  const validator = rewardEvent?.attributes?.find((attribute) => attribute.key === 'validator')?.value

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

const virtualMessageFromEvents = (msg: Message, events: { [key: string]: Event[] }): Message | undefined => {
  // ibc send tx indicated by events
  const sendPacket = events[0]?.find((event) => event.type === 'send_packet')
  // ibc receive tx indicated by events
  const recvPacket = events[1]?.find((event) => event.type === 'recv_packet')

  if (!sendPacket && !recvPacket) return msg

  if (sendPacket) {
    const packetData = sendPacket?.attributes.find((attribute) => attribute.key === 'packet_data')?.value
    const parsedPacketData = JSON.parse(packetData ?? '{}')

    const ibcSendMessage: Message = {
      type: 'ibc_send',
      value: { amount: parsedPacketData.amount, denom: parsedPacketData.amount },
      from: parsedPacketData.sender,
      to: parsedPacketData.receiver,
      origin: parsedPacketData.sender,
    }
    return ibcSendMessage
  } else if (recvPacket) {
    const packetData = recvPacket?.attributes.find((attribute) => attribute.key === 'packet_data')?.value
    const parsedPacketData = JSON.parse(packetData ?? '{}')

    const ibcRecvMessage: Message = {
      type: 'ibc_receive',
      value: { amount: parsedPacketData.amount, denom: parsedPacketData.amount },
      from: parsedPacketData.sender,
      to: parsedPacketData.receiver,
      origin: parsedPacketData.sender,
    }
    return ibcRecvMessage
  }
  console.warn(`cant create virtual message from events ${events}`)
  return
}

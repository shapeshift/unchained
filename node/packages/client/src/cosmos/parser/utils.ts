import { TxMetadata } from '../types'
import { Event, Message } from '../../generated/cosmos'
import { Event as CosmosEvent, Message as CosmosMessage, Attribute as CosmosAttribute } from '../index'

export const metaData = (msg: Message, events: Event[], address: string, caip19: string): TxMetadata => {
  const parser = 'cosmos'
  const method = msg.type

  let delegator = ''
  let validator = ''
  let oldValidator = ''
  let value = '0'

  const from = msg.from
  const to = msg.to

  if (method === 'delegate') {
    delegator = address
    validator = to || ''
    value = msg?.value?.amount ?? '0'
  } else if (method === 'begin_redelegate') {
    oldValidator = from || ''
    validator = to || ''
    value = msg?.value?.amount ?? '0'
  } else if (method === 'begin_unbonding') {
    validator = from || ''
    delegator = to || ''
    value = msg?.value?.amount ?? '0'
  } else if (method === 'withdraw_delegator_reward') {
    validator = from || ''
    delegator = to || ''
    value = getRewardValue({ msg, events }) ?? '0'
  } else {
    console.error(`cosmos parser metaData unsupported message type ${method}`)
  }

  return {
    parser,
    method,
    delegator,
    validator,
    value,
    from,
    to,
    caip19,
    oldValidator,
  }
}

/**
 * @param msg of type withdraw_rewards
 * @param events cosmos transaction events get reward amount from
 * @returns amount of reward claimed
 */
const getRewardValue = ({ msg, events }: { msg: CosmosMessage; events: Array<CosmosEvent> }): string => {
  const expectedValidator = msg.from

  const rewardEvent = events.find((event: CosmosEvent) => event.type === 'withdraw_rewards')

  const valueUnparsed = rewardEvent?.attributes.find((attribute: CosmosAttribute) => attribute.key === 'amount')?.value
  const validator = rewardEvent?.attributes.find((attribute: CosmosAttribute) => attribute.key === 'validator')?.value

  if (expectedValidator !== validator) {
    console.error('valueFromEvents unexpected delegator')
    return '0'
  }
  if (!valueUnparsed) {
    console.error('valueFromEvents couldnt get value from events')
    return '0'
  }

  return valueUnparsed.slice(0, valueUnparsed.length - 'uatom'.length)
}

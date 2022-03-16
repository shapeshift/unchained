import { Event as CosmosEvent, Message as CosmosMessage, Attribute as CosmosAttribute } from '../index'

/**
 * Some cosmos message types such as `withdraw_delegator_reward` have an empty value
 * This gets the value for a given message from events if possible
 * @param msg message whos value should instead come from events
 * @param events cosmos transaction events
 * @returns corresponding value from event logs
 */
export const valueFromEvents = (msg: CosmosMessage, events: Array<CosmosEvent>): string => {
  if (msg.type === 'withdraw_delegator_reward') {
    return getRewardValue({ msg, events })
  } else throw new Error('valueFromEvents unsupported message type')
}

/**
 * @param validator
 * @param events cosmos transaction events get reward amount from
 * @returns amount of reward claimed
 */
const getRewardValue = ({ msg, events }: { msg: CosmosMessage; events: Array<CosmosEvent> }): string => {
  const validator = msg.from

  const rewardEvents = events.filter((event: CosmosEvent) => event.type === 'withdraw_rewards')

  const rewardEvent = rewardEvents.find((event: CosmosEvent) => {
    const attributes = event.attributes

    const attribute = attributes.find(
      (attribute: CosmosAttribute) => attribute.key === 'validator' && attribute.value === validator
    )
    return !!attribute
  })

  const valueUnparsed = rewardEvent?.attributes.find((attribute: CosmosAttribute) => attribute.key === 'amount')?.value

  if (!valueUnparsed) throw new Error('valueFromEvents couldnt get value from events')

  return valueUnparsed.slice(0, valueUnparsed.length - 'uatom'.length)
}

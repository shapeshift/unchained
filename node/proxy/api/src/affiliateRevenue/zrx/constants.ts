import { NATIVE_TOKEN_ADDRESS } from '../constants'

export { NATIVE_TOKEN_ADDRESS }

export const ZRX_API_KEY = process.env.ZRX_API_KEY

if (!ZRX_API_KEY) throw new Error('ZRX_API_KEY env var not set')

export const ZRX_API_URL = 'https://api.0x.org/trade-analytics'
export const SERVICES = ['swap', 'gasless'] as const

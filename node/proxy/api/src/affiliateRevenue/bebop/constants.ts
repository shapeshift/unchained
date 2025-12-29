export const BEBOP_API_KEY = process.env.BEBOP_API_KEY

if (!BEBOP_API_KEY) throw new Error('BEBOP_API_KEY env var not set')

export const BEBOP_API_URL = 'https://api.bebop.xyz/history/v2/trades'
export const SHAPESHIFT_REFERRER = 'shapeshift'
export const NANOSECONDS_PER_SECOND = 1_000_000_000
export const FEE_BPS_DENOMINATOR = 10000

// upstream modules require their api key at import time, so this must be imported first
process.env.COINGECKO_API_KEY ??= 'test'
process.env.ZERION_API_KEY ??= 'test'
process.env.PORTALS_API_KEY ??= 'test'

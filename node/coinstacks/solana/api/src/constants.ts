export const INDEXER_URL = process.env.INDEXER_URL
export const RPC_URL = process.env.RPC_URL
export const RPC_API_KEY = process.env.RPC_API_KEY
export const NETWORK = process.env.NETWORK

if (!NETWORK) throw new Error('NETWORK env var not set')
if (!RPC_URL) throw new Error('RPC_URL env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')
if (!INDEXER_URL) throw new Error('INDEXER_URL env var not set')

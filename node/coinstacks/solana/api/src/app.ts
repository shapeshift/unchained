import express from 'express'
import { join } from 'path'
import swaggerUi from 'swagger-ui-express'
import { ConnectionHandler, middleware, Prometheus, Registry, TransactionHandler } from '@shapeshiftoss/common-api'
import { Logger } from '@shapeshiftoss/logger'
import { RegisterRoutes } from './routes'
import { Server } from 'ws'
import { SolanaWebsocketClient } from './websocket'
import { Helius } from 'helius-sdk'
import { GeyserResultTransaction } from './models'

const PORT = process.env.PORT ?? 3000
const RPC_API_KEY = process.env.RPC_API_KEY
const WEBSOCKET_URL = process.env.WEBSOCKET_URL
const WEBSOCKET_API_KEY = process.env.WEBSOCKET_API_KEY

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'solana', 'api'],
  level: process.env.LOG_LEVEL,
})

if (!WEBSOCKET_URL) throw new Error('WEBSOCKET_URL env var not set')
if (!WEBSOCKET_API_KEY) throw new Error('WEBSOCKET_API_KEY env var not set')
if (!RPC_API_KEY) throw new Error('RPC_API_KEY env var not set')

export const heliusSdk = new Helius(RPC_API_KEY)

const prometheus = new Prometheus({ coinstack: 'solana' })

const app = express()

app.use(...middleware.common(prometheus))

app.get('/health', async (_, res) => res.json({ status: 'up', asset: 'solana' }))

app.get('/metrics', async (_, res) => {
  res.setHeader('Content-Type', prometheus.register.contentType)
  res.send(await prometheus.register.metrics())
})

const options: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Solana API Docs',
  customfavIcon: '/public/favi-blue.png',
  swaggerUrl: '/swagger.json',
}

app.use('/public', express.static(join(__dirname, '../../../../../../common/api/public')))
app.use('/swagger.json', express.static(join(__dirname, './swagger.json')))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(undefined, options))

RegisterRoutes(app)

// redirect any unmatched routes to docs
app.get('/', async (_, res) => {
  res.redirect('/docs')
})

app.use(middleware.errorHandler, middleware.notFoundHandler)

const server = app.listen(PORT, () => logger.info('Server started'))

const transactionHandler: TransactionHandler<GeyserResultTransaction, GeyserResultTransaction> = async (geyserTx) => {
  const addresses = geyserTx.transaction.message.accountKeys.map((key) => key.pubkey)

  return { addresses, tx: geyserTx }
}

const registry = new Registry({
  addressFormatter: (address: string) => address,
  // @TODO: Make it optional in the registry class
  blockHandler: async () => {
    return { txs: [] }
  },
  transactionHandler,
})

const heliusWebsocket = new SolanaWebsocketClient(WEBSOCKET_URL, {
  apiKey: WEBSOCKET_API_KEY,
  transactionHandler: registry.onTransaction.bind(registry),
})

const wsServer = new Server({ server })

wsServer.on('connection', (connection) => {
  ConnectionHandler.start(connection, registry, heliusWebsocket, prometheus, logger)
})

import express from 'express'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import { Logger } from '@shapeshiftoss/logger'
import { middleware, ConnectionHandler, Registry, BlockHandler, TransactionHandler } from '@shapeshiftoss/common-api'
import { getAddresses, NewBlock, Tx as BlockbookTx, WebsocketClient } from '@shapeshiftoss/blockbook'
import { utxo } from '@shapeshiftoss/common-api'
import { Prometheus } from '@shapeshiftoss/prometheus'
import { service, formatAddress } from './controller'
import { RegisterRoutes } from './routes'

const PORT = process.env.PORT ?? 3000
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const INDEXER_API_KEY = process.env.INDEXER_API_KEY

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const IS_LIQUIFY = INDEXER_WS_URL.toLowerCase().includes('liquify')
const IS_NOWNODES = INDEXER_WS_URL.toLowerCase().includes('nownodes')

const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'bitcoincash', 'api'],
  level: process.env.LOG_LEVEL,
})

const prometheus = new Prometheus({ coinstack: 'bitcoincash' })

const app = express()

app.use(...middleware.common(prometheus))

app.get('/health', async (_, res) =>
  res.json({ status: 'up', network: 'bitcoincash', connections: wsServer.clients.size })
)

app.get('/metrics', async (_, res) => {
  res.setHeader('Content-Type', prometheus.register.contentType)
  res.send(await prometheus.register.metrics())
})

const options = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Bitcoin Cash API Docs',
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

const blockHandler: BlockHandler<NewBlock, Array<BlockbookTx>> = async (block) => {
  const txs = await service.handleBlock(block.hash)
  return { txs }
}

const transactionHandler: TransactionHandler<BlockbookTx, utxo.Tx> = async (blockbookTx) => {
  const tx = service.handleTransaction(blockbookTx)
  const addresses = getAddresses(blockbookTx)
  return { addresses, tx }
}

const registry = new Registry({ addressFormatter: formatAddress, blockHandler, transactionHandler })

const wsUrl = INDEXER_API_KEY && IS_LIQUIFY ? `${INDEXER_WS_URL}/api=${INDEXER_API_KEY}` : INDEXER_WS_URL
const apiKey = INDEXER_API_KEY && IS_NOWNODES ? INDEXER_API_KEY : undefined

const blockbook = new WebsocketClient(
  wsUrl,
  {
    apiKey,
    blockHandler: registry.onBlock.bind(registry),
    transactionHandler: registry.onTransaction.bind(registry),
  },
  { resetInterval: 15 * 60 * 1000 } // 15 minutes
)

const server = app.listen(PORT, () => logger.info('Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => {
  ConnectionHandler.start(connection, registry, blockbook, prometheus, logger)
})

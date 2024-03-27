import express from 'express'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import { Logger } from '@shapeshiftoss/logger'
import {
  middleware,
  ConnectionHandler,
  Registry,
  BlockHandler,
  TransactionHandler,
  Prometheus,
} from '@shapeshiftoss/common-api'
import { getAddresses, NewBlock, Tx as BlockbookTx, WebsocketClient } from '@shapeshiftoss/blockbook'
import { utxo } from '@shapeshiftoss/common-api'
import { formatAddress, service } from './controller'
import { RegisterRoutes } from './routes'

const PORT = process.env.PORT ?? 3000
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const INDEXER_API_KEY = process.env.INDEXER_API_KEY

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'dogecoin', 'api'],
  level: process.env.LOG_LEVEL,
})

const prometheus = new Prometheus({ coinstack: 'dogecoin' })

const app = express()

app.use(...middleware.common(prometheus))

app.get('/health', async (_, res) =>
  res.json({ status: 'up', network: 'dogecoin', connections: wsServer.clients.size })
)

app.get('/metrics', async (_, res) => {
  res.setHeader('Content-Type', prometheus.register.contentType)
  res.send(await prometheus.register.metrics())
})

const options = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Dogecoin API Docs',
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

const blockbook = new WebsocketClient(INDEXER_WS_URL, {
  apiKey: INDEXER_API_KEY,
  blockHandler: registry.onBlock.bind(registry),
  transactionHandler: registry.onTransaction.bind(registry),
})

const server = app.listen(PORT, () => logger.info('Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => {
  ConnectionHandler.start(connection, registry, blockbook, prometheus, logger)
})

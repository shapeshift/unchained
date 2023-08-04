import express, { json, urlencoded } from 'express'
import cors from 'cors'
import { join } from 'path'
import { Server } from 'ws'
import morgan from 'morgan'
import swaggerUi from 'swagger-ui-express'
import { Logger } from '@shapeshiftoss/logger'
import { middleware, ConnectionHandler, Registry, BlockHandler, TransactionHandler } from '@shapeshiftoss/common-api'
import { getAddresses, NewBlock, Tx as BlockbookTx, WebsocketClient } from '@shapeshiftoss/blockbook'
import { utxo } from '@shapeshiftoss/common-api'
import { formatAddress, service } from './controller'
import { RegisterRoutes } from './routes'

const PORT = process.env.PORT ?? 3000
const INDEXER_WS_URL = process.env.INDEXER_WS_URL

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'dogecoin', 'api'],
  level: process.env.LOG_LEVEL,
})

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))
app.use(cors())
app.use(morgan('short'))

app.get('/health', async (_, res) =>
  res.json({ status: 'up', network: 'dogecoin', connections: wsServer.clients.size })
)

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

app.use(middleware.errorHandler)
app.use(middleware.notFoundHandler)

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

const server = app.listen(PORT, () => logger.info('Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => ConnectionHandler.start(connection, registry))

new WebsocketClient(INDEXER_WS_URL, {
  blockHandler: registry.onBlock.bind(registry),
  transactionHandler: registry.onTransaction.bind(registry),
})

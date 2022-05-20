import express, { json, urlencoded } from 'express'
import cors from 'cors'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import { Logger } from '@shapeshiftoss/logger'
import { middleware, ConnectionHandler, Registry } from '@shapeshiftoss/common-api'
import { getAddresses, NewBlock, Tx as BlockbookTx, WebsocketClient } from '@shapeshiftoss/blockbook'
import { RegisterRoutes } from './routes'
import { BitcoinTx } from './models'
import { handleTransaction } from './handlers'

const PORT = process.env.PORT ?? 3000
const INDEXER_WS_URL = process.env.INDEXER_WS_URL

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'bitcoin', 'api'],
  level: process.env.LOG_LEVEL,
})

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))
app.use(cors())

app.get('/health', async (_, res) => res.json({ status: 'up', network: 'bitcoin', connections: wsServer.clients.size }))

const options = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Bitcoin API Docs',
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

// TODO: format address (bech32 addresses = toLowerCase, non bech32 addresses = assume checksum and don't format)
const registry = new Registry()
  .blockHandler<NewBlock, Array<BlockbookTx>>(async (block) => {
    const txs = await handleBlock(block.hash)
    return { txs }
  })
  .transactionHandler<BlockbookTx, BitcoinTx>(async (blockbookTx) => {
    const tx = handleTransaction(blockbookTx)
    const addresses = getAddresses(blockbookTx)
    return { addresses, tx }
  })

const server = app.listen(PORT, () => logger.info('Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => ConnectionHandler.start(connection, registry))

new WebsocketClient(INDEXER_WS_URL)
  .blockHandler(registry.onBlock.bind(registry))
  .transactionHandler(registry.onTransaction.bind(registry))

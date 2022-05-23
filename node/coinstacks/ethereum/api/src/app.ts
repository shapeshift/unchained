import express, { json, urlencoded } from 'express'
import cors from 'cors'
import { ethers } from 'ethers'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import { middleware, ConnectionHandler, Registry } from '@shapeshiftoss/common-api'
import { Tx as BlockbookTx, WebsocketClient, getAddresses, NewBlock } from '@shapeshiftoss/blockbook'
import { logger } from './logger'
import { RegisterRoutes } from './routes'
import { EthereumTx } from './models'
import { handleBlock, handleTransactionWithInternalTrace } from './handlers'

const PORT = process.env.PORT ?? 3000
const INDEXER_WS_URL = process.env.INDEXER_WS_URL

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))
app.use(cors())

app.get('/health', async (_, res) => res.json({ status: 'up', asset: 'ethereum', connections: wsServer.clients.size }))

const options: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Ethereum API Docs',
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

const registry = new Registry()
  .formatAddress((address) => ethers.utils.getAddress(address))
  .blockHandler<NewBlock, Array<BlockbookTx>>(async (block) => {
    const txs = await handleBlock(block.hash)
    return { txs }
  })
  .transactionHandler<BlockbookTx, EthereumTx>(async (blockbookTx) => {
    const tx = await handleTransactionWithInternalTrace(blockbookTx)
    const internalAddresses = (tx.internalTxs ?? []).reduce<Array<string>>((prev, tx) => [...prev, tx.to, tx.from], [])
    const addresses = [...new Set([...getAddresses(blockbookTx), ...internalAddresses])]

    return { addresses, tx }
  })

const server = app.listen(PORT, () => logger.info('Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => ConnectionHandler.start(connection, registry))

new WebsocketClient(INDEXER_WS_URL)
  .blockHandler(registry.onBlock.bind(registry))
  .transactionHandler(registry.onTransaction.bind(registry))

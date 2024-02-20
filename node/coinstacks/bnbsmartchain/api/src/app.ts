import express from 'express'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import {
  evm,
  middleware,
  ConnectionHandler,
  Registry,
  BlockHandler,
  TransactionHandler,
  Prometheus,
} from '@shapeshiftoss/common-api'
import { Tx as BlockbookTx, WebsocketClient, getAddresses, NewBlock } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { gasOracle, service } from './controller'
import { RegisterRoutes } from './routes'

const PORT = process.env.PORT ?? 3000
const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const INDEXER_API_KEY = process.env.INDEXER_API_KEY

if (!INDEXER_WS_URL) throw new Error('INDEXER_WS_URL env var not set')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'bnbsmartchain', 'api'],
  level: process.env.LOG_LEVEL,
})

const prometheus = new Prometheus({ coinstack: 'bnbsmartchain' })

const app = express()

app.use(...middleware.common(prometheus))

app.get('/health', async (_, res) =>
  res.json({ status: 'up', asset: 'bnbsmartchain', connections: wsServer.clients.size })
)

app.get('/metrics', async (_, res) => {
  res.setHeader('Content-Type', prometheus.register.contentType)
  res.send(await prometheus.register.metrics())
})

const options: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift BNB Smart Chain API Docs',
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

const blockHandler: BlockHandler<NewBlock, Array<{ addresses: Array<string>; tx: evm.Tx }>> = async (block) => {
  const blockbookTxs = await service.handleBlock(block.hash)
  const internalTxs = await service.fetchInternalTxsByBlockDebug(block.hash)

  const txs = blockbookTxs.map((t) => {
    const tx = service.handleTransaction(t)
    tx.internalTxs = internalTxs[t.txid]

    const internalAddresses = (tx.internalTxs ?? []).reduce<Array<string>>((prev, tx) => [...prev, tx.to, tx.from], [])
    const addresses = [...new Set([...getAddresses(t), ...internalAddresses])]

    return { addresses, tx }
  })

  return { txs }
}

const transactionHandler: TransactionHandler<BlockbookTx, evm.Tx> = async (blockbookTx) => {
  const tx = await service.handleTransactionWithInternalTrace(blockbookTx)
  const internalAddresses = (tx.internalTxs ?? []).reduce<Array<string>>((prev, tx) => [...prev, tx.to, tx.from], [])
  const addresses = [...new Set([...getAddresses(blockbookTx), ...internalAddresses])]

  return { addresses, tx }
}

const registry = new Registry({ addressFormatter: evm.formatAddress, blockHandler, transactionHandler })

const server = app.listen(PORT, () => logger.info('Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => {
  ConnectionHandler.start(connection, registry, prometheus, logger)
})

new WebsocketClient(INDEXER_WS_URL, {
  apiKey: INDEXER_API_KEY,
  blockHandler: [registry.onBlock.bind(registry), gasOracle.onBlock.bind(gasOracle)],
  transactionHandler: registry.onTransaction.bind(registry),
})

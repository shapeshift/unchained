import express from 'express'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import {
  evm,
  middleware,
  ConnectionHandler,
  Registry,
  AddressFormatter,
  TransactionHandler,
  Prometheus,
} from '@shapeshiftoss/common-api'
import { Tx as BlockbookTx, WebsocketClient, getAddresses } from '@shapeshiftoss/blockbook'
import { Logger } from '@shapeshiftoss/logger'
import { BlockbookService } from '../../../common/api/src/evm/blockbookService'
import { MoralisService } from '../../../common/api/src/evm/moralisService'
import { gasOracle, service } from './controller'
import { RegisterRoutes } from './routes'

const PORT = process.env.PORT ?? 3000

const INDEXER_WS_URL = process.env.INDEXER_WS_URL
const INDEXER_API_KEY = process.env.INDEXER_API_KEY

const IS_LIQUIFY = INDEXER_WS_URL?.toLowerCase().includes('liquify')

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'base', 'api'],
  level: process.env.LOG_LEVEL,
})

const prometheus = new Prometheus({ coinstack: 'base' })

const app = express()

app.use(...middleware.common(prometheus))

app.get('/health', async (_, res) => res.json({ status: 'up', asset: 'base', connections: wsServer.clients.size }))

app.get('/metrics', async (_, res) => {
  res.setHeader('Content-Type', prometheus.register.contentType)
  res.send(await prometheus.register.metrics())
})

const options: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Base API Docs',
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

const addressFormatter: AddressFormatter = (address) => evm.formatAddress(address)

const transactionHandler = (() => {
  if (service instanceof BlockbookService) {
    const blockbookService = service
    return (async (blockbookTx) => {
      const tx = await blockbookService.handleTransactionWithInternalTrace(blockbookTx)
      const internalAddresses = (tx.internalTxs ?? []).reduce<Array<string>>(
        (prev, tx) => [...prev, tx.to, tx.from],
        []
      )
      const addresses = [...new Set([...getAddresses(blockbookTx), ...internalAddresses])]

      return { addresses, tx }
    }) satisfies TransactionHandler<BlockbookTx, evm.Tx>
  }

  if (service instanceof MoralisService) {
    const moralisService = service
    return (async (tx) => {
      return { addresses: moralisService.getAddresses(tx), tx }
    }) satisfies TransactionHandler<evm.Tx, evm.Tx>
  }

  return
})()

if (!transactionHandler) throw new Error('invalid transaction handler')

const registry = new Registry({ addressFormatter, transactionHandler })

const subscriptionClient = (() => {
  if (IS_LIQUIFY && gasOracle) {
    if (!INDEXER_API_KEY) throw new Error('INDEXER_API_KEY env var not set')

    return new WebsocketClient(`${INDEXER_WS_URL}/api=${INDEXER_API_KEY}`, {
      blockHandler: [gasOracle.onBlock.bind(gasOracle)],
      transactionHandler: registry.onTransaction.bind(registry),
    })
  }

  if (service instanceof MoralisService) {
    service.transactionHandler = registry.onTransaction.bind(registry)
    return service
  }

  return
})()

if (!subscriptionClient) throw new Error('invalid transaction handler')

const server = app.listen(PORT, () => logger.info('Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => {
  ConnectionHandler.start(connection, registry, subscriptionClient, prometheus, logger)
})

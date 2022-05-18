import express, { json, urlencoded } from 'express'
import cors from 'cors'
import { ethers } from 'ethers'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import { middleware, ConnectionHandler, Registry } from '@shapeshiftoss/common-api'
import { Tx as BlockbookTx, WebsocketClient, getAddresses } from '@shapeshiftoss/blockbook'
import { logger } from './logger'
import { RegisterRoutes } from './routes'
import { EthereumTx } from './models'

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
  .transactionHandler<BlockbookTx, EthereumTx>((blockbookTx) => {
    // TODO: detect internal tx addresses on mempool txs
    const addresses = getAddresses(blockbookTx)

    if (!blockbookTx.ethereumSpecific) throw new Error('invalid blockbook ethereum transaction')

    const tx: EthereumTx = {
      txid: blockbookTx.txid,
      blockHash: blockbookTx.blockHash,
      blockHeight: blockbookTx.blockHeight,
      timestamp: blockbookTx.blockTime,
      status: blockbookTx.ethereumSpecific.status,
      from: blockbookTx.vin[0].addresses?.[0] ?? '',
      to: blockbookTx.vout[0].addresses?.[0] ?? '',
      confirmations: blockbookTx.confirmations,
      value: blockbookTx.value,
      fee: blockbookTx.fees ?? '0',
      gasLimit: blockbookTx.ethereumSpecific.gasLimit.toString(),
      gasUsed: blockbookTx.ethereumSpecific.gasUsed?.toString() ?? '0',
      gasPrice: blockbookTx.ethereumSpecific.gasPrice.toString(),
      inputData: blockbookTx.ethereumSpecific.data,
      tokenTransfers: blockbookTx.tokenTransfers?.map((tt) => ({
        contract: tt.token,
        decimals: tt.decimals,
        name: tt.name,
        symbol: tt.symbol,
        type: tt.type,
        from: tt.from,
        to: tt.to,
        value: tt.value,
      })),
    }

    return { addresses, tx }
  })

const server = app.listen(PORT, () => logger.info({ port: PORT }, 'Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => ConnectionHandler.start(connection, registry))

const wsClient = new WebsocketClient(INDEXER_WS_URL)
wsClient.onMessage(registry.handleMessage.bind(registry))

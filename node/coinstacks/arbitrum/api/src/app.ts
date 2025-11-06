import express from 'express'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import { evm, middleware, ConnectionHandler, Registry, TransactionHandler, Prometheus } from '@shapeshiftoss/common-api'
import { Logger } from '@shapeshiftoss/logger'
import { service } from './controller'
import { RegisterRoutes } from './routes'

const PORT = process.env.PORT ?? 3000

export const logger = new Logger({
  namespace: ['unchained', 'coinstacks', 'arbitrum', 'api'],
  level: process.env.LOG_LEVEL,
})

const prometheus = new Prometheus({ coinstack: 'arbitrum' })

const app = express()

app.use(...middleware.common(prometheus))

app.get('/health', async (_, res) => res.json({ status: 'up', asset: 'arbitrum', connections: wsServer.clients.size }))

app.get('/metrics', async (_, res) => {
  res.setHeader('Content-Type', prometheus.register.contentType)
  res.send(await prometheus.register.metrics())
})

const options: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Arbitrum One API Docs',
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

const transactionHandler: TransactionHandler<evm.Tx, evm.Tx> = async (tx) => {
  return { addresses: service.getAddresses(tx), tx }
}

const registry = new Registry({ addressFormatter: evm.formatAddress, transactionHandler })

service.transactionHandler = registry.onTransaction.bind(registry)

const server = app.listen(PORT, () => logger.info('Server started'))
const wsServer = new Server({ server })

wsServer.on('connection', (connection) => {
  ConnectionHandler.start(connection, registry, service, prometheus, logger)
})

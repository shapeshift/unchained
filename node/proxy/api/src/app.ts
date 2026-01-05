import express from 'express'
import { join } from 'path'
import swaggerUi from 'swagger-ui-express'
import { middleware } from '@shapeshiftoss/common-api'
import { Logger } from '@shapeshiftoss/logger'
import { Prometheus } from '@shapeshiftoss/prometheus'
import { Server } from 'ws'
import { RegisterRoutes } from './routes'
import { CoinGecko } from './coingecko'
import { Zerion } from './zerion'
import { Zrx } from './zrx'
import { Portals } from './portals'
import { MarketDataConnectionHandler } from './marketData'
import { CoincapWebsocketClient } from './coincap'

const PORT = process.env.PORT ?? 3000
const COINCAP_API_KEY = process.env.COINCAP_API_KEY

export const logger = new Logger({
  namespace: ['unchained', 'proxy', 'api'],
  level: process.env.LOG_LEVEL,
})

const prometheus = new Prometheus({ coinstack: 'proxy' })

const app = express()

app.use(...middleware.common(prometheus))

app.get('/health', async (_, res) => res.json({ status: 'ok' }))

app.get('/metrics', async (_, res) => {
  res.setHeader('Content-Type', prometheus.register.contentType)
  res.send(await prometheus.register.metrics())
})

const options: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Proxy API Docs',
  customfavIcon: '/public/favi-blue.png',
  swaggerUrl: '/swagger.json',
}

app.use('/public', express.static(join(__dirname, '../../../../../../coinstacks/common/api/public/')))
app.use('/swagger.json', express.static(join(__dirname, './swagger.json')))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(undefined, options))

RegisterRoutes(app)

const coingecko = new CoinGecko()
app.get('/api/v1/markets/*', coingecko.handler.bind(coingecko))

const zerion = new Zerion()
app.get('/api/v1/zerion/*', zerion.handler.bind(zerion))

const zrx = new Zrx()
app.get('/api/v1/zrx/*', zrx.handler.bind(zrx))

const portals = new Portals()
app.get('/api/v1/portals/*', portals.handler.bind(portals))

// redirect any unmatched routes to docs
app.get('/', async (_, res) => {
  res.redirect('/docs')
})

app.use(middleware.errorHandler, middleware.notFoundHandler)

const server = app.listen(PORT, () => logger.info('Server started'))

const coincap = new CoincapWebsocketClient(`wss://wss.coincap.io/prices?assets=ALL&apiKey=${COINCAP_API_KEY}`, {
  logger,
})

const wsServer = new Server({ server })

wsServer.on('connection', (connection) => {
  MarketDataConnectionHandler.start(connection, coincap, prometheus, logger)
})

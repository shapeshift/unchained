import express from 'express'
import { join } from 'path'
import swaggerUi from 'swagger-ui-express'
import { middleware } from '@shapeshiftoss/common-api'
import { Logger } from '@shapeshiftoss/logger'
import { RegisterRoutes } from './routes'
import { CoinGecko } from './coingecko'
import { Zerion } from './zerion'

const PORT = process.env.PORT ?? 3000

export const logger = new Logger({
  namespace: ['unchained', 'proxy', 'api'],
  level: process.env.LOG_LEVEL,
})

const app = express()

app.use(...middleware.common())

app.get('/health', async (_, res) => res.json({ status: 'ok' }))

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

// redirect any unmatched routes to docs
app.get('/', async (_, res) => {
  res.redirect('/docs')
})

app.use(middleware.errorHandler, middleware.notFoundHandler)

app.listen(PORT, () => logger.info('Server started'))

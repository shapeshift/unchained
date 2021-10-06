import express, { json, urlencoded } from 'express'
import cors from 'cors'
import { join } from 'path'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import { logger } from '@shapeshiftoss/logger'
import { middleware } from '../../../common/api/src'
import { RegisterRoutes } from './routes'
import { ConnectionHandler } from './websocket'

const port = process.env.PORT || 3000

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))
app.use(cors())

app.get('/health', async (_, res) => {
  res.json({
    status: 'up',
    network: 'thorchain',
  })
})

const options: swaggerUi.SwaggerUiOptions = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Thorchain API Docs',
  customfavIcon: '/public/favi-blue.png',
  swaggerUrl: '/swagger.json',
}

app.use('/public', express.static(join(__dirname, '../../../../../../common/api/public')))
app.use('/swagger.json', express.static(join(__dirname, './swagger.json')))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(undefined, options))

RegisterRoutes(app)

// redirect any unmatched routes to docs
app.get('*', async (_, res) => {
  res.redirect('/docs')
})

app.use(middleware.errorHandler)
app.use(middleware.notFoundHandler)

const server = app.listen(port, () => logger.info('server listening...'))

const wsServer = new Server({ server })

wsServer.on('connection', (connection: WebSocket) => {
  new ConnectionHandler(connection).start()
})

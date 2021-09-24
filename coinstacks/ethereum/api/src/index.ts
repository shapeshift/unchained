import express, { json, urlencoded } from 'express'
import cors from 'cors'
import { join } from 'path'
import { v4 } from 'uuid'
import { Server } from 'ws'
import swaggerUi from 'swagger-ui-express'
import { logger } from '@shapeshiftoss/logger'
import { middleware } from '../../../common/api/src'
import { RegisterRoutes } from './routes'

const port = process.env.PORT || 3000

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))
app.use(cors())

app.get('/health', async (_, res) => {
  res.json({
    status: 'up',
    network: 'ethereum',
  })
})

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
app.get('*', async (_, res) => {
  res.redirect('/docs')
})

app.use(middleware.errorHandler)
app.use(middleware.notFoundHandler)

const server = app.listen(port, () => logger.info('server listening...'))

const wsServer = new Server({ server })

interface RegisterClientData {
  address: string
  blockNumber?: number
}

interface Subscription {
  method: 'subscribe' | 'unsubscribe'
  topic: string
  data: RegisterClientData
}

interface WebsocketError {
  type: 'error'
  message: string
}

wsServer.on('connection', (connection) => {
  const id = v4()

  connection.on('message', (message) => {
    try {
      const payload = JSON.parse(message.toString()) as Subscription

      switch (payload.method) {
        case 'subscribe': {
          switch (payload.topic) {
            case 'txs': {
              const data = payload.data as RegisterClientData
              if (!data.address) {
                const error: WebsocketError = {
                  type: 'error',
                  message: 'address required',
                }
                connection.send(JSON.stringify(error))
                return
              }

              console.log(data.address, data.blockNumber ?? 0, id)

              // Payload parsing and types (postpone)
              // Create dynamic queue with topic client_id binding
              // Register account with unique uuid and associated address. Update ingester_meta with the appropriate block height
              // TBD - questions related to register document
              // Trigger initial sync with fake "mempool" transaction (see ingester/register.ts)
              // Create a Worker to consume from dynamic queue created above
              // Send all messages back over websocket to client
              // **DATA CONSISTENCY/ORDERING** think about

              break
            }
            default: {
              const error: WebsocketError = {
                type: 'error',
                message: 'topic not supported',
              }
              connection.send(JSON.stringify(error))
            }
          }
          break
        }
        case 'unsubscribe': {
          console.log('unsubscribe')
          break
        }
        default: {
          const error: WebsocketError = {
            type: 'error',
            message: 'method not supported',
          }
          connection.send(JSON.stringify(error))
        }
      }
    } catch (err) {
      console.log('err', err)
      connection.emit('bad payload')
    }
  })

  connection.on('close', () => {
    // cleanup queues
  })
})

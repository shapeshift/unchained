import express, { json, urlencoded } from 'express'
import cors from 'cors'
import { join } from 'path'
import swaggerUi from 'swagger-ui-express'
import { logger } from '@shapeshiftoss/logger'
import { middleware } from '../../../common/api/src'
import { RegisterRoutes } from './routes'
import swaggerDocument from './swagger.json'

const port = process.env.PORT || 3000

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))
app.use(cors())

app.get('/', async (_, res) => {
  res.redirect('/docs')
})

app.get('/health', async (_, res) => {
  res.json({
    status: 'up',
    network: 'ethereum',
  })
})

const options = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift Ethereum API Docs',
  customfavIcon: '/favi-blue.png',
}

app.use(express.static(join(__dirname, '../../../../../../common/api/public')))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options))

RegisterRoutes(app)

app.use(middleware.errorHandler)
app.use(middleware.notFoundHandler)

app.listen(port, () => logger.info(`listening at http://localhost:${port}`))

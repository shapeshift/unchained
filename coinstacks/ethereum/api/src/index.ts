import express, { json, Response, Request, urlencoded } from 'express'
import cors from 'cors'
import swaggerUi from 'swagger-ui-express'
import { logger } from '@shapeshiftoss/logger'
import { middleware } from '../../../common/api/src'
import { RegisterRoutes } from './routes'

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

import swaggerDocument from './swagger.json'
const options = {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'ShapeShift API Docs',
  customfavIcon: './favi-blue.png',
}

app.use('/coinstacks/common/api/public/favi-blue.png', express.static('./favi-blue.png'))
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, options), async (_req: Request, res: Response) => {
  return res.send(swaggerUi.generateHTML(await import('./swagger.json')))
})

RegisterRoutes(app)

app.use(middleware.errorHandler)
app.use(middleware.notFoundHandler)

app.listen(port, () => logger.info(`listening at http://localhost:${port}`))

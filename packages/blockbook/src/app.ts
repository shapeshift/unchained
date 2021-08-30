import express, { json, Response, Request, urlencoded } from 'express'
import swaggerUi from 'swagger-ui-express'
import { RegisterRoutes } from './routes'

const port = process.env.PORT || 4000

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))

app.get('/', async (_, res) => {
  res.redirect('/docs')
})

app.use('/docs', swaggerUi.serve, async (_req: Request, res: Response) => {
  return res.send(swaggerUi.generateHTML(await import('./swagger.json')))
})

RegisterRoutes(app)

app.listen(port, () => console.log(`listening at http://localhost:${port}`))

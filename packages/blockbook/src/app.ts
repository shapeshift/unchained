import express, { json, urlencoded } from 'express'
import swaggerUi from 'swagger-ui-express'
import { RegisterRoutes } from './routes'
import swaggerDocument from './swagger.json'

const port = process.env.PORT || 4000

const app = express()

app.use(json())
app.use(urlencoded({ extended: true }))

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument))

RegisterRoutes(app)

// redirect any unmatched routes to docs
app.get('*', async (_, res) => {
  res.redirect('/docs')
})

app.listen(port, () => console.log(`listening at http://localhost:${port}`))

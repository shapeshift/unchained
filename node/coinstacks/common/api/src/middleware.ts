import { json, urlencoded, NextFunction, Request, Response } from 'express'
import compression from 'compression'
import morgan from 'morgan'
import cors from 'cors'
import { ValidateError } from 'tsoa'
import { ApiError, NotFoundError } from '.'
import { Prometheus } from './prometheus'

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): Response | void {
  if (err instanceof ValidateError) {
    const e = err as ValidateError

    console.warn(`Caught Validation Error for ${req.path}:`, e.fields)

    return res.status(422).json({
      message: 'Validation Failed',
      details: e.fields,
    })
  }

  if (err instanceof ApiError) {
    const e = err as ApiError
    console.error(e)
    return res.status(e.statusCode ?? 500).json({ message: e.message })
  }

  if (err instanceof SyntaxError) {
    console.error(err)
    return res.status(400).json({
      message: err.message,
    })
  }

  if (err instanceof Error) {
    console.error(err)
    return res.status(500).json({
      message: 'Internal Server Error',
    })
  }

  next()
}

export function notFoundHandler(_req: Request, res: Response): void {
  const err: NotFoundError = {
    message: 'Not Found',
  }

  res.status(404).send(err)
}

export const requestLogger = morgan('short', {
  skip: (req, res) => !req.url?.startsWith('/api/v1') || res.statusCode === 404,
})

export const metrics =
  (prometheus: Prometheus) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const end = prometheus.metrics.httpRequestDurationSeconds.startTimer()

    res.on('finish', () => {
      const route = req.originalUrl ?? req.url

      if (!route.startsWith('/api/v1/') || res.statusCode === 404) return

      prometheus.metrics.httpRequestCounter.inc({ method: req.method, route, statusCode: res.statusCode }, 1)
      end({ method: req.method, route, statusCode: res.statusCode })
    })

    next()
  }

export const common = (prometheus?: Prometheus) => {
  const _default = [compression(), json(), urlencoded({ extended: false }), cors(), requestLogger]

  if (!prometheus) return _default
  return _default.concat(metrics(prometheus))
}

import { json, urlencoded, NextFunction, Request, Response } from 'express'
import compression from 'compression'
import morgan from 'morgan'
import cors from 'cors'
import { ValidateError } from 'tsoa'
import { ApiError, NotFoundError } from '.'

export function errorHandler(err: Error, _: Request, res: Response, next: NextFunction): Response | void {
  if (err instanceof ValidateError) {
    const e = err as ValidateError

    return res.status(422).json({
      message: 'Validation Failed',
      details: e.fields,
    })
  }

  if (err.constructor.name === ApiError.prototype.constructor.name) {
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

// json lines are parsed into filterable fields by railway
export const requestLogger = morgan<Request, Response>(
  (tokens, req, res) => {
    // total-time is also recorded for client aborted requests, unlike response-time
    const responseTime = Number(tokens['total-time'](req, res))

    return JSON.stringify({
      level: 'info',
      message: `${req.method} ${req.originalUrl} ${res.statusCode} ${responseTime} ms`,
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      responseTime,
      aborted: !res.writableFinished,
      cache: res.getHeader('x-cache'),
      requestBytes: Number(req.headers['content-length'] ?? 0),
      ip: req.headers['cf-connecting-ip'] ?? req.headers['x-real-ip'] ?? req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      origin: req.headers['origin'] ?? req.headers['referer'],
    })
  },
  { skip: (req, res) => !req.originalUrl?.startsWith('/api/v1') || res.statusCode === 404 }
)

export const common = () => [
  compression(),
  json({ limit: '1mb' }),
  urlencoded({ extended: false }),
  cors(),
  requestLogger,
]

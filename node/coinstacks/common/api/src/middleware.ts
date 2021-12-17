import { NextFunction, Response, Request } from 'express'
import { ValidateError } from 'tsoa'
import { ApiError, NotFoundError } from '.'

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): Response | void {
  if (err.constructor.name === ValidateError.prototype.constructor.name) {
    const e = err as ValidateError

    console.warn(`Caught Validation Error for ${req.path}:`, e.fields)

    return res.status(422).json({
      message: 'Validation Failed',
      details: e.fields,
    })
  }

  if (err.constructor.name === ApiError.prototype.constructor.name) {
    const e = err as ApiError
    console.error(e)
    return res.status(e.statusCode).json(JSON.parse(e.message))
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

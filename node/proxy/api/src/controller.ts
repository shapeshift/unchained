import { Controller, Example, Get, Path, Response, Route, Tags } from 'tsoa'
import { BadRequestError, InternalServerError, ValidationError } from '../../../coinstacks/common/api/src' // unable to import models from a module with tsoa
import { ValidationResult } from './models'
import { Elliptic } from './elliptic'
import { handleError } from '@shapeshiftoss/common-api'

const elliptic = new Elliptic()

@Route('api/v1')
export class Proxy extends Controller {
  /**
   * Get address validation status
   *
   * @param {string} address address
   *
   * @returns {Promise<ValidationResult>} validation result
   */
  @Example<ValidationResult>({ valid: true })
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Tags('Validation')
  @Get('/validate/{address}')
  async validateAddress(@Path() address: string): Promise<ValidationResult> {
    try {
      return await elliptic.validateAddress(address)
    } catch (err) {
      throw handleError(err)
    }
  }
}

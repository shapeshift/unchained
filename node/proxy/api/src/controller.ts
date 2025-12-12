import { Controller, Example, Get, Path, Query, Response, Route, Tags } from 'tsoa'
import { BadRequestError, InternalServerError, ValidationError } from '../../../coinstacks/common/api/src' // unable to import models from a module with tsoa
import { AffiliateRevenueResponse, ValidationResult } from './models'
import { Elliptic } from './elliptic'
import { AffiliateRevenue } from './affiliateRevenue'
import { handleError } from '@shapeshiftoss/common-api'

const elliptic = new Elliptic()
const affiliateRevenue = new AffiliateRevenue()

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

  /**
   * Get affiliate revenue
   *
   * @param {number} startTimestamp start timestamp (unix seconds)
   * @param {number} endTimestamp end timestamp (unix seconds)
   *
   * @returns {Promise<AffiliateRevenueResponse>} affiliate revenue
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Tags('Affiliate Revenue')
  @Get('/affiliate/revenue')
  async getAffiliateRevenue(
    @Query() startTimestamp: number,
    @Query() endTimestamp: number
  ): Promise<AffiliateRevenueResponse> {
    try {
      return await affiliateRevenue.getAffiliateRevenue(startTimestamp, endTimestamp)
    } catch (err) {
      throw handleError(err)
    }
  }
}

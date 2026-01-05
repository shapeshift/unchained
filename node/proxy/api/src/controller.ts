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
   * @param {string} startDate start date (YYYY-MM-DD)
   * @param {string} endDate end date (YYYY-MM-DD)
   *
   * @returns {Promise<AffiliateRevenueResponse>} affiliate revenue
   */
  @Response<BadRequestError>(400, 'Bad Request')
  @Response<ValidationError>(422, 'Validation Error')
  @Response<InternalServerError>(500, 'Internal Server Error')
  @Tags('Affiliate Revenue')
  @Get('/affiliate/revenue')
  async getAffiliateRevenue(
    @Query() startDate: string,
    @Query() endDate: string
  ): Promise<AffiliateRevenueResponse> {
    try {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(startDate)) {
        throw new Error('Invalid startDate format, expected YYYY-MM-DD')
      }
      if (!dateRegex.test(endDate)) {
        throw new Error('Invalid endDate format, expected YYYY-MM-DD')
      }

      // Validate dates are valid calendar dates
      const startTimestamp = Math.floor(new Date(`${startDate}T00:00:00Z`).getTime() / 1000)
      const endTimestamp = Math.floor(new Date(`${endDate}T23:59:59Z`).getTime() / 1000)

      if (isNaN(startTimestamp)) {
        throw new Error('Invalid startDate value')
      }
      if (isNaN(endTimestamp)) {
        throw new Error('Invalid endDate value')
      }

      return await affiliateRevenue.getAffiliateRevenue(startTimestamp, endTimestamp)
    } catch (err) {
      throw handleError(err)
    }
  }
}

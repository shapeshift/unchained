import { GasEstimate, GasFees } from '../../../common/api/src/evm' // unable to import models from a module with tsoa

/**
 * Contains info about estimated gas cost of a transaction on both L1 and L2
 */
export interface OptimismGasEstimate extends GasEstimate {
  l1GasLimit: string
}

/**
 * Contains info about current recommended fees for a transaction on both L1 and L2
 */
export interface OptimismGasFees extends GasFees {
  l1GasPrice: string
}

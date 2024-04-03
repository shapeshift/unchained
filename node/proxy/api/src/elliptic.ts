import { isAxiosError } from 'axios'
import { AML } from 'elliptic-sdk'

const ELLIPTIC_API_KEY = process.env.ELLIPTIC_API_KEY
const ELLIPTIC_API_SECRET = process.env.ELLIPTIC_API_SECRET

if (!ELLIPTIC_API_KEY) throw new Error('ELLIPTIC_API_KEY env var not set')
if (!ELLIPTIC_API_SECRET) throw new Error('ELLIPTIC_API_SECRET env var not set')

const RISK_SCORE_THRESHOLD = 1

const aml = new AML({
  key: ELLIPTIC_API_KEY,
  secret: ELLIPTIC_API_SECRET,
})

type WalletResponse = {
  id: string
  risk_score?: number
}

type WalletError = {
  name: string
  message: string
}

export const validateAddress = async (address: string): Promise<{ valid: boolean }> => {
  try {
    const { data } = await aml.client.post<WalletResponse>('/v2/wallet/synchronous', {
      subject: {
        asset: 'holistic',
        blockchain: 'holistic',
        type: 'address',
        hash: address,
      },
      type: 'wallet_exposure',
    })

    if (data.risk_score && data.risk_score >= RISK_SCORE_THRESHOLD) return { valid: false }

    return { valid: true }
  } catch (err) {
    // the submitted address has not yet been processed into the elliptic tool or does not exist on the blockchain
    // assume valid and put responsibility back on client for any further validation
    if (
      isAxiosError<WalletError>(err) &&
      err.response?.status === 404 &&
      err.response.data.name === 'NotInBlockchain'
    ) {
      return { valid: true }
    }

    throw err
  }
}

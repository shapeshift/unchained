import { isAxiosError } from 'axios'
import { AML } from 'elliptic-sdk'

const ELLIPTIC_API_KEY = process.env.ELLIPTIC_API_KEY
const ELLIPTIC_API_SECRET = process.env.ELLIPTIC_API_SECRET

if (!ELLIPTIC_API_KEY) throw new Error('ELLIPTIC_API_KEY env var not set')
if (!ELLIPTIC_API_SECRET) throw new Error('ELLIPTIC_API_SECRET env var not set')

const RISK_SCORE_THRESHOLD = 1
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

type AddressCache = Partial<Record<string, boolean>>

interface WalletResponse {
  id: string
  risk_score?: number
}

interface WalletError {
  name: string
  message: string
}

export class Elliptic {
  private aml: AML
  private addressCache: AddressCache

  constructor() {
    this.aml = new AML({
      key: ELLIPTIC_API_KEY as string,
      secret: ELLIPTIC_API_SECRET as string,
    })
    this.addressCache = {}

    setInterval(() => this.resetCache(), CACHE_TTL_MS)
  }

  async validateAddress(address: string): Promise<{ valid: boolean }> {
    const valid = this.addressCache[address]
    if (valid !== undefined) return { valid }

    try {
      const { data } = await this.aml.client.post<WalletResponse>('/v2/wallet/synchronous', {
        subject: {
          asset: 'holistic',
          blockchain: 'holistic',
          type: 'address',
          hash: address,
        },
        type: 'wallet_exposure',
      })

      if (data.risk_score && data.risk_score >= RISK_SCORE_THRESHOLD) {
        this.addressCache[address] = false
        return { valid: false }
      }

      this.addressCache[address] = true
      return { valid: true }
    } catch (err) {
      // the submitted address has not yet been processed into the elliptic tool or does not exist on the blockchain
      // assume valid and put responsibility back on client for any further validation
      if (
        isAxiosError<WalletError>(err) &&
        err.response?.status === 404 &&
        err.response.data.name === 'NotInBlockchain'
      ) {
        this.addressCache[address] = true
        return { valid: true }
      }

      throw err
    }
  }

  /**
   * resetCache will remove all valid addresses while keeping all invalid addresses.
   * - valid addresses may be invalidated which is why they are removed and forced to refectch from elliptic
   * - invalid addresses will always remain invalid so there is no need to refetch ever
   */
  private resetCache(): void {
    this.addressCache = Object.entries(this.addressCache).reduce<AddressCache>((prev, [address, valid]) => {
      if (valid) return prev
      prev[address] = valid
      return prev
    }, {})
  }
}

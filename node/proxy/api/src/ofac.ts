import axios from 'axios'
import { XMLParser } from 'fast-xml-parser'
import { Logger } from '@shapeshiftoss/logger'
import { getAddress, isAddress } from 'viem'

const OFAC_SDN_URL = 'https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN_ADVANCED.XML'
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

const ADDITIONAL_SANCTIONED_ADDRESSES = [
  '0x5d3919F12bCc35c26Eee5F8226A9bee90c257Ccc',
  '0xBb6A6006Eb71205e977eCeb19FCaD1C8d631C787',
  '0x1F4C1c2e610f089D6914c4448E6F21Cb0db3adeF',
  '0xeBA786C9517a4823A5cFD9c72e4E80BF8168129B',
  '0xCBb24A6B4DAfaAA1a759A2F413eA0eB6AE1455CC',
  '0x8d11AeAC74267DD5C56D371bf4AE1AFA174C2d49',
]

interface OfacArgs {
  logger: Logger
}

export class Ofac {
  private sanctionedAddresses: Set<string> = new Set()
  private logger: Logger
  private refreshInterval: NodeJS.Timeout | undefined

  constructor(args: OfacArgs) {
    this.logger = args.logger
  }

  async initialize(): Promise<void> {
    try {
      this.sanctionedAddresses = await this.fetchAndParseOfacList()
      this.logger.info({ addressCount: this.sanctionedAddresses.size }, 'OFAC service initialized')

      this.refreshInterval = setInterval(async () => {
        try {
          this.sanctionedAddresses = await this.fetchAndParseOfacList()
          this.logger.info({ addressCount: this.sanctionedAddresses.size }, 'OFAC list refreshed')
        } catch (err) {
          this.logger.error({ err }, 'Failed to refresh OFAC list')
        }
      }, REFRESH_INTERVAL_MS)
    } catch (err) {
      this.logger.error({ err }, 'Failed to initialize OFAC service')
      throw err
    }
  }

  async validateAddress(address: string): Promise<{ valid: boolean }> {
    if (this.sanctionedAddresses.has(this.normalizeAddress(address))) {
      return { valid: false }
    }

    return { valid: true }
  }

  private async fetchAndParseOfacList(): Promise<Set<string>> {
    const { data } = await axios.get<string>(OFAC_SDN_URL, { responseType: 'text' })
    const addresses = this.parseXml(data)

    for (const address of ADDITIONAL_SANCTIONED_ADDRESSES) {
      addresses.add(this.normalizeAddress(address))
    }

    return addresses
  }

  private parseXml(xmlData: string): Set<string> {
    const addresses = new Set<string>()

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true,
      numberParseOptions: { hex: false, leadingZeros: false },
    })

    const result = parser.parse(xmlData)

    const sanctions = result?.Sanctions
    if (!sanctions) throw new Error('No Sanctions element found in OFAC XML')

    const featureTypeIds = new Map<number, string>()
    const referenceValueSets = sanctions.ReferenceValueSets

    if (referenceValueSets?.FeatureTypeValues?.FeatureType) {
      const featureTypes = Array.isArray(referenceValueSets.FeatureTypeValues.FeatureType)
        ? referenceValueSets.FeatureTypeValues.FeatureType
        : [referenceValueSets.FeatureTypeValues.FeatureType]

      for (const featureType of featureTypes) {
        const name = String(featureType['#text'] ?? featureType ?? '')

        if (name.includes('Digital Currency Address')) {
          const id = parseInt(featureType['@_ID'], 10)
          if (!isNaN(id)) featureTypeIds.set(id, name)
        }
      }
    }

    if (featureTypeIds.size === 0) throw new Error('No Digital Currency Address feature types found')

    const parties = sanctions.DistinctParties?.DistinctParty
    if (!parties) throw new Error('No DistinctParty entries found')

    const partyList = Array.isArray(parties) ? parties : [parties]

    for (const party of partyList) {
      const profiles = party.Profile
      if (!profiles) continue

      const profileList = Array.isArray(profiles) ? profiles : [profiles]

      for (const profile of profileList) {
        const features = profile.Feature
        if (!features) continue

        const featureList = Array.isArray(features) ? features : [features]

        for (const feature of featureList) {
          const featureTypeId = parseInt(feature['@_FeatureTypeID'], 10)
          if (!featureTypeIds.has(featureTypeId)) continue

          const featureVersions = feature.FeatureVersion
          if (!featureVersions) continue

          const featureVersionList = Array.isArray(featureVersions) ? featureVersions : [featureVersions]

          for (const featureVersion of featureVersionList) {
            const versionDetails = featureVersion.VersionDetail
            if (!versionDetails) continue

            const detailList = Array.isArray(versionDetails) ? versionDetails : [versionDetails]

            for (const detail of detailList) {
              const addr = typeof detail === 'string' ? detail : detail['#text']
              if (typeof addr === 'string' && addr.trim()) {
                addresses.add(this.normalizeAddress(addr.trim()))
              }
            }
          }
        }
      }
    }

    return addresses
  }

  private normalizeAddress(address: string): string {
    if (isAddress(address, { strict: false })) return getAddress(address)
    return address
  }

  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = undefined
    }
  }
}

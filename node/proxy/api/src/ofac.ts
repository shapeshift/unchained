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
  '0xD4B87bAB0ee142182f7F6DA030AeFe3E7f171530',
  '0x18102f56E7Af4228344cA81d67714E14835E87c0',
  '0x6cD95e71C0e5faD6506b7c588A5af0251AEe1E3a',
  '0x204a5492F60b771E8622a813BfE1ee3E90a53d6D',
  '0xc00f04A33Ca521ca167903b5ae59810013eCb7AF',
  '0x3e4Ed9ee5130c49D1e9eA32B9D9947054fBB21F1',
  '0xd57aB8e692Dc6DFe19d98DD9B9c331F26742265b',
  '0x0eAaec4e8299409faaA93e81eF5Ed49d1CA90b69',
  '0x18Fb19E303F672C1bAd9a0D0a05b68E690311B39',
  '0x14Fa51bb5d6AC147d902F738bf103f36d75b80Ab',
  '0xB4A6E69F7dc3866914B568F3dE4f3D8B47D80Ca5',
  '0xC91F8d6200Fc427D5993f58b428882FFAD8FA7D9',
  '0x42a71A7ED12582378d4A4567A1af6Bad4f03dF84',
  '0x8D35d5d0e6d0619224d90d526aaE773Ca3A01Ca8',
  '0x33F6C752E69d04F2ab162d9Cc2Ff8D1766326F18',
  '0xa6d623b871D8F5E17F1a774B19d4faFfa348BDaA',
  '0xC74D19b551E084C7824eD238066BC245917c69C4',
  '0x424993DD317EC44db13ee94FE4d1Ea6e204E77d1',
  '0x1C7dA4E9740f99279c193540328314c04E2Edc00',
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

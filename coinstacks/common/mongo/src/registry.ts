import assert from 'assert'
import { Collection, DeleteWriteOpResultObject, MongoClient, UpdateWriteOpResult } from 'mongodb'

const COLLECTION = 'registry'

/**
 * Contains ingester metadata to keep track of sync status for an address
 */
export interface IngesterMetadata {
  block?: number
  syncing?: {
    key?: string
    startTime: number
    endTime: number
  }
}

/**
 * Contains registry info and is used for un/registering addresses
 */
export interface RegistryDocument {
  client_id: string
  ingester_meta?: Record<string, IngesterMetadata>
  registration: {
    addresses?: string[]
    pubkey?: string
  }
}

export class RegistryService {
  private client?: MongoClient
  private collection?: Collection

  // currently set up to create a single client connection so we can use pooling, however, this is an asynchronous callback which is not ideal to use in a constructor
  constructor(url: string, db: string, poolsize?: number) {
    MongoClient.connect(url, { useUnifiedTopology: true, poolSize: poolsize }, (err, client) => {
      assert.strictEqual(null, err)

      this.client = client
      this.collection = this.client.db(db).collection(COLLECTION)
      this.collection.createIndex({ client_id: 1, 'registration.pubkey': 1 }, { unique: true })
      this.collection.createIndex({ client_id: 1, 'registration.addresses': 1 })
    })
  }

  disconnect(): void {
    this.client?.close()
  }

  async getByAddress(address: string): Promise<Array<RegistryDocument> | undefined> {
    address = address.toLowerCase()
    const cursors = this.collection?.find<RegistryDocument>({ 'registration.addresses': { $in: [address] } }, {})
    return cursors?.toArray()
  }

  async updateBlock(address: string, block: number, client_id: string): Promise<UpdateWriteOpResult | undefined> {
    address = address.toLowerCase()
    return this.collection?.updateOne(
      { client_id: client_id, 'registration.addresses': { $in: [address] } },
      { $set: { [`ingester_meta.${address}.block`]: block } }
    )
  }

  async updateSyncing(address: string, client_id: string, key?: string): Promise<UpdateWriteOpResult | undefined> {
    address = address.toLowerCase()
    return this.collection?.updateOne(
      { client_id: client_id, 'registration.addresses': { $in: [address] } },
      {
        $set: {
          [`ingester_meta.${address}.syncing.key`]: key,
          [`ingester_meta.${address}.syncing.startTime`]: key ? Date.now() : 0,
          [`ingester_meta.${address}.syncing.endTime`]: key ? 0 : Date.now(),
        },
      }
    )
  }

  async add(document: RegistryDocument): Promise<UpdateWriteOpResult | undefined> {
    document = this.sanitizeDocument(document)
    const addresses = document.registration.addresses ?? []

    return this.collection?.updateOne(
      {
        client_id: document.client_id,
        'registration.pubkey': document.registration.pubkey,
      },
      {
        $set: {
          client_id: document.client_id,
          'registration.pubkey': document.registration.pubkey,
          ...addresses.reduce((prev, address) => {
            const key = `ingester_meta.${address}.block`
            const block = document.ingester_meta?.[address].block ?? 0
            return { ...prev, [key]: block }
          }, {}),
        },
        $addToSet: {
          'registration.addresses': { $each: addresses },
        },
      },
      { upsert: true }
    )
  }

  async remove(document: RegistryDocument): Promise<UpdateWriteOpResult | undefined> {
    document = this.sanitizeDocument(document)

    return this.collection?.updateOne(
      {
        client_id: document.client_id,
        'registration.pubkey': document.registration.pubkey,
      },
      {
        $pull: {
          'registration.addresses': { $in: document.registration.addresses },
        },
      }
    )
  }

  async delete(document: RegistryDocument): Promise<DeleteWriteOpResultObject | undefined> {
    document = this.sanitizeDocument(document)

    return this.collection?.deleteOne({
      client_id: document.client_id,
      'registration.pubkey': document.registration.pubkey,
    })
  }

  sanitizeDocument(document: RegistryDocument): RegistryDocument {
    const { client_id, registration } = document
    const { addresses } = registration

    return {
      client_id, // client_id will always be saved in the format it was received
      registration: {
        pubkey: registration.pubkey, // pubkey will always be saved in the format it was received
        addresses: addresses?.map((a) => a.toLowerCase()),
      },
    }
  }
}

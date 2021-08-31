import assert from 'assert'
import { Collection, DeleteWriteOpResultObject, MongoClient, UpdateWriteOpResult } from 'mongodb'

const COLLECTION = 'registry'

/**
 * Contains registry info and is used for un/registering addresses
 */
export interface RegistryDocument {
  client_id: string
  ingester_meta?: {
    block?: number
    syncing?: {
      key?: string
      startTime: number
      endTime: number
    }
  }
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

  async getByAddress(address: string, client_id = 'unchained'): Promise<RegistryDocument | undefined> {
    const document = await this.collection?.findOne<RegistryDocument>({
      'registration.addresses': { $in: [address.toLowerCase()] },
      client_id: client_id,
    })
    return document ?? undefined
  }

  async updateBlock(address: string, block: number, client_id = 'unchained'): Promise<UpdateWriteOpResult | undefined> {
    return this.collection?.updateOne(
      { client_id: client_id, 'registration.addresses': { $in: [address.toLowerCase()] } },
      { $set: { 'ingester_meta.block': block } }
    )
  }

  async updateSyncing(
    address: string,
    key?: string,
    client_id = 'unchained'
  ): Promise<UpdateWriteOpResult | undefined> {
    return this.collection?.updateOne(
      { client_id: client_id, 'registration.addresses': { $in: [address.toLowerCase()] } },
      {
        $set: {
          'ingester_meta.syncing.key': key,
          'ingester_meta.syncing.startTime': key ? Date.now() : 0,
          'ingester_meta.syncing.endTime': key ? 0 : Date.now(),
        },
      }
    )
  }

  async add(document: RegistryDocument): Promise<UpdateWriteOpResult | undefined> {
    document = this.sanitizeDocument(document)

    return this.collection?.updateOne(
      {
        client_id: document.client_id,
        'registration.pubkey': document.registration.pubkey,
      },
      {
        $set: {
          client_id: document.client_id,
          'registration.pubkey': document.registration.pubkey,
          'ingester_meta.block': document.ingester_meta?.block ?? 0,
        },
        $addToSet: {
          'registration.addresses': { $each: document.registration.addresses ?? [] },
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

    let pubkey = registration.pubkey
    if (!pubkey) {
      if (addresses?.length === 1) {
        pubkey = addresses[0]
      } else {
        throw new Error('pubkey must be specified')
      }
    }

    return {
      client_id: client_id.toLowerCase(),
      registration: {
        pubkey: pubkey, // pubkey will always be saved in the format it was received
        addresses: addresses?.map((a) => a.toLowerCase()),
      },
    }
  }
}

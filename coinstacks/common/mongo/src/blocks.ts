import assert from 'assert'
import { Collection, MongoClient } from 'mongodb'

const NODE_ENV = process.env.NODE_ENV
const MONGO_DBNAME = process.env.MONGO_DBNAME as string
const MONGO_URL = process.env.MONGO_URL as string

if (NODE_ENV !== 'test') {
  if (!MONGO_DBNAME) throw new Error('MONGO_DBNAME env var not set')
  if (!MONGO_URL) throw new Error('MONGO_URL env var not set')
}

const COLLECTION = 'blocks'

/**
 * Contains info about blocks that have been synced
 */
export interface BlockDocument {
  hash: string
  height: number
  isOrphaned?: boolean
  prevHash: string
}

export class BlockService {
  private client?: MongoClient
  private collection?: Collection<BlockDocument>

  // currently set up to create a single client connection so we can use pooling, however, this is an asynchronous callback which is not ideal to use in a constructor
  constructor(poolsize?: number) {
    MongoClient.connect(MONGO_URL as string, { useUnifiedTopology: true, poolSize: poolsize }, (err, client) => {
      assert.strictEqual(null, err)

      this.client = client
      this.collection = this.client.db(MONGO_DBNAME).collection(COLLECTION)
      this.collection.createIndex({ hash: 1 }, { unique: true })
      this.collection.createIndex({ height: -1 })
    })
  }

  disconnect(): void {
    this.client?.close()
  }

  async getByHash(hash: string): Promise<BlockDocument | undefined> {
    const document = await this.collection?.findOne({ hash })
    return document ?? undefined
  }

  async getLatest(): Promise<BlockDocument | undefined> {
    const blocks = await this.collection?.find({ isOrphaned: false }).sort({ height: -1 }).limit(1).toArray()
    return blocks?.[0]
  }

  async orphan(document: BlockDocument): Promise<void> {
    document = this.sanitizeDocument(document)
    await this.collection?.updateOne(document, { $set: { isOrphaned: true } })
  }

  async save(document: BlockDocument): Promise<void> {
    document = this.sanitizeDocument(document)
    await this.collection?.updateOne({ hash: document.hash }, { $set: document }, { upsert: true })
  }

  private sanitizeDocument(document: BlockDocument): BlockDocument {
    const { hash, isOrphaned } = document
    document.hash = hash.toLowerCase()
    document.isOrphaned = isOrphaned ? true : false
    return document
  }
}

# Ingester

Worker services process data as it routes through the RabbitMQ topology in order to provide all transaction history details for any addresses registered by a client.

## Client -&gt; Unchained Pipeline

Performs any actions required by a client. There is a single topic exchange: `exchange.unchained`, to allow an external client to publish messages to unchained.

* Account Registration

  ![Account Registration Pipeline](../.gitbook/assets/accountRegistrationPipeline.png) Handles \(un\)registering accounts for a client. Accounts are registered per coinstack.

## Ingestion Pipeline

Syncs all past transaction history and detects all new pending and confirmed transactions for all registered accounts.

![Ingestion Pipeline](../.gitbook/assets/ingestionPipeline%20%283%29.png)

### Sockets

* New Block: Subscribes to be notified of any new blocks confirmed on the blockchain and publishes the block hash for the new block worker to process.
* New Transaction: Subscribes to be notified of any new transactions broadcasted to the blockchain and publishes the transaction for the tx worker to process.

### Workers

* New Block: Processes each block hash, checking for any reorg events and performing a block delta sync.

  Unchained keeps track of all blocks that have been processed in the `blocks` mongo collection. If a reorg is detected, all orphaned blocks will be marked as orphaned and the delta sync will begin at the latest block processed on the main chain fork.

  A block delta sync will fetch all blocks from the latest \(non orphaned\) processed block height to the current node height. This ensures there will never be a missed block during ingestion. Blocks are fetched synchronously in ascending order and published to the block worker to process. As blocks are processed, the `blocks` mongo collection is updated accordingly.

* Block: Processes each block fetched by the new block worker synchronously to keep ascending block order and publishes all txids found in the block to the txid worker to process.
* TxID: Processes transaction ids concurrently, fetching the full transaction details and publishes the transaction for the tx worker to process.
* Tx: Processes transactions either from block ingestion \(confirmed\) or the new transaction socket \(pending\) concurrently, detecting if any registered addresses are associated with the transaction and performing an account delta sync and publishing all transaction history \(txids\) to the address worker to process.

  Unchained keeps track of the sync state of each registered account in the `registry` mongo collection under the `ingester_meta` document object key. An account delta sync will fetch all transaction history for the address or pubkey from the block range of latest block height synced to the block height of the transaction detected or current node height if a mempool transaction. This ensures there will never be missed transactions during ingestion for an account.

  The sync state will be updated upon completion of the account delta sync. There is a syncing key that will prevent any subsequent delta syncs from occuring until the current one finishes. A sync timeout exists to prevent a deadlock in case the current delta sync doesn't finish within a reasonable amount of time, releasing the sync key lock and allowing the next waiting delta sync to begin.

  Upon registration of a new account, a fake transaction is published to kick off a full initial delta sync from block 0 to current node height, including an current mempool transactions.

* Address: Processes all transaction ids for an account's transaction history concurrently, fetching the full transaction details and parsing the transaction to determine all of the parts of the transaction the account was associated with. The parsed transaction is then published to the client worker to process.
  * Send: any value sent by address
  * Receive: any value received by address
  * Fee: any fees paid by address
  * Trade: any details related to a dex trade
  * Token: any details related to the token sent or received if applicable


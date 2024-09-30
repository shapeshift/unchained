import { BaseAccount, BaseTx, BaseTxHistory } from '../../../common/api/src' // unable to import models from a module with tsoa

/**
 * Contains info about a transaction
 */
export type Tx = RawTx & BaseTx

export interface RawTx {
  description: string
  type: TransactionType
  source: string
  fee: number
  feePayer: string
  signature: string
  slot: number
  timestamp: number
  nativeTransfers: NativeTransfer[]
  tokenTransfers: TokenTransfer[]
  accountData: AccountData[]
  transactionError: TransactionError
  instructions: Instruction[]
  events: Events
}

export interface AccountData {
  account: string
  nativeBalanceChange: number
  tokenBalanceChanges: TokenBalanceChange[]
}

export interface TokenBalanceChange {
  userAccount: string
  tokenAccount: string
  mint: string
  rawTokenAmount: RawTokenAmount
}

export interface RawTokenAmount {
  tokenAmount: string
}

export interface Events {
  nft: EventsNft
  swap: Swap
  compressed: Compressed
  distributeCompressionRewards: DistributeCompressionRewards
  setAuthority: SetAuthority
}

export interface Compressed {
  type: string
  treeId: string
  assetId: string
  newLeafOwner: string
  oldLeafOwner: string
}

export interface DistributeCompressionRewards {}

export interface EventsNft {
  description: string
  type: string
  source: string
  amount: number
  fee: number
  feePayer: string
  signature: string
  slot: number
  timestamp: number
  saleType: string
  buyer: string
  seller: string
  staker: string
  nfts: NftElement[]
}

export interface NftElement {
  mint: string
  tokenStandard: string
}

export interface SetAuthority {
  account: string
  from: string
  to: string
}

export interface Swap {
  nativeInput: NativeInput
  nativeOutput: NativeInput
  tokenInputs: TokenBalanceChange[]
  tokenOutputs: TokenBalanceChange[]
  tokenFees: TokenBalanceChange[]
  nativeFees: NativeInput[]
  innerSwaps: InnerSwap[]
}

export interface InnerSwap {
  tokenInputs: TokenTransfer[]
  tokenOutputs: TokenTransfer[]
  tokenFees: TokenTransfer[]
  nativeFees: NativeTransfer[]
  programInfo: ProgramInfo
}

export interface NativeTransfer {
  fromUserAccount: string
  toUserAccount: string
}

export interface ProgramInfo {
  source: string
  account: string
  programName: string
  instructionName: string
}

export interface TokenTransfer {
  fromUserAccount: string
  toUserAccount: string
  fromTokenAccount: string
  toTokenAccount: string
  tokenAmount: number
  mint: string
}

export interface NativeInput {
  account: string
  amount: string
}

export interface Instruction {
  accounts: string[]
  data: string
  programId: string
  innerInstructions?: Instruction[]
}

export interface TransactionError {
  error: string
}
export enum TransactionType {
  UNKNOWN = 'UNKNOWN',
  NFT_BID = 'NFT_BID',
  NFT_BID_CANCELLED = 'NFT_BID_CANCELLED',
  NFT_LISTING = 'NFT_LISTING',
  NFT_CANCEL_LISTING = 'NFT_CANCEL_LISTING',
  NFT_SALE = 'NFT_SALE',
  NFT_MINT = 'NFT_MINT',
  NFT_AUCTION_CREATED = 'NFT_AUCTION_CREATED',
  NFT_AUCTION_UPDATED = 'NFT_AUCTION_UPDATED',
  NFT_AUCTION_CANCELLED = 'NFT_AUCTION_CANCELLED',
  NFT_PARTICIPATION_REWARD = 'NFT_PARTICIPATION_REWARD',
  NFT_MINT_REJECTED = 'NFT_MINT_REJECTED',
  CREATE_STORE = 'CREATE_STORE',
  WHITELIST_CREATOR = 'WHITELIST_CREATOR',
  ADD_TO_WHITELIST = 'ADD_TO_WHITELIST',
  REMOVE_FROM_WHITELIST = 'REMOVE_FROM_WHITELIST',
  AUCTION_MANAGER_CLAIM_BID = 'AUCTION_MANAGER_CLAIM_BID',
  EMPTY_PAYMENT_ACCOUNT = 'EMPTY_PAYMENT_ACCOUNT',
  UPDATE_PRIMARY_SALE_METADATA = 'UPDATE_PRIMARY_SALE_METADATA',
  ADD_TOKEN_TO_VAULT = 'ADD_TOKEN_TO_VAULT',
  ACTIVATE_VAULT = 'ACTIVATE_VAULT',
  INIT_VAULT = 'INIT_VAULT',
  INIT_BANK = 'INIT_BANK',
  INIT_STAKE = 'INIT_STAKE',
  MERGE_STAKE = 'MERGE_STAKE',
  SPLIT_STAKE = 'SPLIT_STAKE',
  SET_BANK_FLAGS = 'SET_BANK_FLAGS',
  SET_VAULT_LOCK = 'SET_VAULT_LOCK',
  UPDATE_VAULT_OWNER = 'UPDATE_VAULT_OWNER',
  UPDATE_BANK_MANAGER = 'UPDATE_BANK_MANAGER',
  RECORD_RARITY_POINTS = 'RECORD_RARITY_POINTS',
  ADD_RARITIES_TO_BANK = 'ADD_RARITIES_TO_BANK',
  INIT_FARM = 'INIT_FARM',
  INIT_FARMER = 'INIT_FARMER',
  REFRESH_FARMER = 'REFRESH_FARMER',
  UPDATE_FARM = 'UPDATE_FARM',
  AUTHORIZE_FUNDER = 'AUTHORIZE_FUNDER',
  DEAUTHORIZE_FUNDER = 'DEAUTHORIZE_FUNDER',
  FUND_REWARD = 'FUND_REWARD',
  CANCEL_REWARD = 'CANCEL_REWARD',
  LOCK_REWARD = 'LOCK_REWARD',
  PAYOUT = 'PAYOUT',
  VALIDATE_SAFETY_DEPOSIT_BOX_V2 = 'VALIDATE_SAFETY_DEPOSIT_BOX_V2',
  SET_AUTHORITY = 'SET_AUTHORITY',
  INIT_AUCTION_MANAGER_V2 = 'INIT_AUCTION_MANAGER_V2',
  UPDATE_EXTERNAL_PRICE_ACCOUNT = 'UPDATE_EXTERNAL_PRICE_ACCOUNT',
  AUCTION_HOUSE_CREATE = 'AUCTION_HOUSE_CREATE',
  CLOSE_ESCROW_ACCOUNT = 'CLOSE_ESCROW_ACCOUNT',
  WITHDRAW = 'WITHDRAW',
  DEPOSIT = 'DEPOSIT',
  TRANSFER = 'TRANSFER',
  BURN = 'BURN',
  BURN_NFT = 'BURN_NFT',
  PLATFORM_FEE = 'PLATFORM_FEE',
  LOAN = 'LOAN',
  REPAY_LOAN = 'REPAY_LOAN',
  ADD_TO_POOL = 'ADD_TO_POOL',
  REMOVE_FROM_POOL = 'REMOVE_FROM_POOL',
  CLOSE_POSITION = 'CLOSE_POSITION',
  UNLABELED = 'UNLABELED',
  CLOSE_ACCOUNT = 'CLOSE_ACCOUNT',
  WITHDRAW_GEM = 'WITHDRAW_GEM',
  DEPOSIT_GEM = 'DEPOSIT_GEM',
  STAKE_TOKEN = 'STAKE_TOKEN',
  UNSTAKE_TOKEN = 'UNSTAKE_TOKEN',
  STAKE_SOL = 'STAKE_SOL',
  UNSTAKE_SOL = 'UNSTAKE_SOL',
  CLAIM_REWARDS = 'CLAIM_REWARDS',
  BUY_SUBSCRIPTION = 'BUY_SUBSCRIPTION',
  SWAP = 'SWAP',
  INIT_SWAP = 'INIT_SWAP',
  CANCEL_SWAP = 'CANCEL_SWAP',
  REJECT_SWAP = 'REJECT_SWAP',
  INITIALIZE_ACCOUNT = 'INITIALIZE_ACCOUNT',
  TOKEN_MINT = 'TOKEN_MINT',
  CREATE_APPARAISAL = 'CREATE_APPARAISAL',
  FUSE = 'FUSE',
  DEPOSIT_FRACTIONAL_POOL = 'DEPOSIT_FRACTIONAL_POOL',
  FRACTIONALIZE = 'FRACTIONALIZE',
  CREATE_RAFFLE = 'CREATE_RAFFLE',
  BUY_TICKETS = 'BUY_TICKETS',
  UPDATE_ITEM = 'UPDATE_ITEM',
  LIST_ITEM = 'LIST_ITEM',
  DELIST_ITEM = 'DELIST_ITEM',
  ADD_ITEM = 'ADD_ITEM',
  CLOSE_ITEM = 'CLOSE_ITEM',
  BUY_ITEM = 'BUY_ITEM',
  FILL_ORDER = 'FILL_ORDER',
  UPDATE_ORDER = 'UPDATE_ORDER',
  CREATE_ORDER = 'CREATE_ORDER',
  CLOSE_ORDER = 'CLOSE_ORDER',
  CANCEL_ORDER = 'CANCEL_ORDER',
  KICK_ITEM = 'KICK_ITEM',
  UPGRADE_FOX = 'UPGRADE_FOX',
  UPGRADE_FOX_REQUEST = 'UPGRADE_FOX_REQUEST',
  LOAN_FOX = 'LOAN_FOX',
  BORROW_FOX = 'BORROW_FOX',
  SWITCH_FOX_REQUEST = 'SWITCH_FOX_REQUEST',
  SWITCH_FOX = 'SWITCH_FOX',
  CREATE_ESCROW = 'CREATE_ESCROW',
  ACCEPT_REQUEST_ARTIST = 'ACCEPT_REQUEST_ARTIST',
  CANCEL_ESCROW = 'CANCEL_ESCROW',
  ACCEPT_ESCROW_ARTIST = 'ACCEPT_ESCROW_ARTIST',
  ACCEPT_ESCROW_USER = 'ACCEPT_ESCROW_USER',
  PLACE_BET = 'PLACE_BET',
  PLACE_SOL_BET = 'PLACE_SOL_BET',
  CREATE_BET = 'CREATE_BET',
  NFT_RENT_UPDATE_LISTING = 'NFT_RENT_UPDATE_LISTING',
  NFT_RENT_ACTIVATE = 'NFT_RENT_ACTIVATE',
  NFT_RENT_CANCEL_LISTING = 'NFT_RENT_CANCEL_LISTING',
  NFT_RENT_LISTING = 'NFT_RENT_LISTING',
  FINALIZE_PROGRAM_INSTRUCTION = 'FINALIZE_PROGRAM_INSTRUCTION',
  UPGRADE_PROGRAM_INSTRUCTION = 'UPGRADE_PROGRAM_INSTRUCTION',
  NFT_GLOBAL_BID = 'NFT_GLOBAL_BID',
  NFT_GLOBAL_BID_CANCELLED = 'NFT_GLOBAL_BID_CANCELLED',
  EXECUTE_TRANSACTION = 'EXECUTE_TRANSACTION',
  APPROVE_TRANSACTION = 'APPROVE_TRANSACTION',
  ACTIVATE_TRANSACTION = 'ACTIVATE_TRANSACTION',
  CREATE_TRANSACTION = 'CREATE_TRANSACTION',
  REJECT_TRANSACTION = 'REJECT_TRANSACTION',
  CANCEL_TRANSACTION = 'CANCEL_TRANSACTION',
  ADD_INSTRUCTION = 'ADD_INSTRUCTION',
  ATTACH_METADATA = 'ATTACH_METADATA',
  REQUEST_PNFT_MIGRATION = 'REQUEST_PNFT_MIGRATION',
  START_PNFT_MIGRATION = 'START_PNFT_MIGRATION',
  MIGRATE_TO_PNFT = 'MIGRATE_TO_PNFT',
  UPDATE_RAFFLE = 'UPDATE_RAFFLE',
  CREATE_POOL = 'CREATE_POOL',
  ADD_LIQUIDITY = 'ADD_LIQUIDITY',
  WITHDRAW_LIQUIDITY = 'WITHDRAW_LIQUIDITY',
}

/**
 * Contains info about transaction history
 */
export type TxHistory = BaseTxHistory<Tx>

/**
 * Contains info about an address associated with an extended public key
 */
export interface Address {
  balance: string
  pubkey: string
}

/**
 * Contains info about an address or extended public key account
 */
export interface Account extends BaseAccount {}

/**
 * Extended coin specific functionality
 */
export interface API {
  /**
   * Get transaction details
   *
   * @param {string} txid transaction hash
   *
   * @returns {Promise<Tx>} transaction payload
   */
  // @Get('tx/{txid}')
  getTransaction(txid: string): Promise<Tx>
}

/**
 * Returns the priority fees estimation
 */
export interface EstimatePriorityFeeBody {
  accountKeys: string[]
}

/**
 * Returns the priority fees estimation
 */
export interface GasFeesBody {
  message: string
}

/**
 * Contains info about current recommended fees to use in a transaction.
 */
export interface GasFees {
  // static base gas fee
  baseFee?: string
  // gas fee including compute units
  gasPrice: string
}

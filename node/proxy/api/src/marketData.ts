import { Logger } from '@shapeshiftoss/logger'
import WebSocket, { Server } from 'ws'
import { v4 } from 'uuid'
import { Server as HttpServer } from 'http'
import { IncomingMessage } from 'http'
import { URL } from 'url'

export interface MarketDataProviderConfig {
  name: string
  wsBaseUrl: string
  apiKey?: string
  // How to construct the WebSocket URL for this provider
  buildUrl: (baseUrl: string, apiKey?: string) => string
  parseMessage: (data: unknown) => Record<string, string> | null
}

export interface MarketDataMessage {
  type: 'price_update'
  source: string
  data: Record<string, string>
  timestamp: number
}

export interface MarketDataClient {
  id: string
  websocket: WebSocket
  assets: string[]
}

const PROVIDERS: Record<string, MarketDataProviderConfig> = {
  coincap: {
    name: 'CoinCap',
    wsBaseUrl: 'wss://wss.coincap.io/prices',
    buildUrl: (baseUrl: string, apiKey?: string) => {
      const params = new URLSearchParams({ assets: 'ALL' })
      if (apiKey) params.set('apiKey', apiKey)
      return `${baseUrl}?${params.toString()}`
    },
    parseMessage: (data: unknown) => {
      // CoinCap sends data directly as asset price object
      return typeof data === 'object' && data !== null ? (data as Record<string, string>) : null
    },
  },
}

export class MarketDataWebSocket {
  private clients = new Map<string, MarketDataClient>()
  private socket?: WebSocket
  private reconnectTimeout?: NodeJS.Timeout
  private readonly logger: Logger
  private readonly provider: MarketDataProviderConfig
  private readonly wsUrl: string
  private readonly reconnectDelayMs = 5000

  constructor(logger: Logger, providerName = 'coincap', apiKey?: string) {
    this.logger = logger.child({ namespace: ['proxy', 'marketData'] })

    this.provider = PROVIDERS[providerName]
    if (!this.provider) {
      throw new Error(`Unknown market data provider: ${providerName}. Available: ${Object.keys(PROVIDERS).join(', ')}`)
    }

    this.wsUrl = this.provider.buildUrl(this.provider.wsBaseUrl, apiKey)
    this.logger.info({ provider: this.provider.name, url: this.wsUrl }, 'Market data provider configured')
  }

  private connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      return
    }

    this.logger.info({ provider: this.provider.name, url: this.wsUrl }, 'Connecting to market data provider')
    this.socket = new WebSocket(this.wsUrl)

    this.socket.onopen = () => {
      this.logger.info({ provider: this.provider.name }, 'Connected to market data provider')
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout)
        this.reconnectTimeout = undefined
      }
    }

    this.socket.onmessage = (event) => {
      this.handleMessage(event)
    }

    this.socket.onclose = (event) => {
      this.logger.warn(
        {
          provider: this.provider.name,
          code: event.code,
          reason: event.reason,
        },
        'Market data provider WebSocket closed'
      )
      this.scheduleReconnect()
    }

    this.socket.onerror = (error) => {
      this.logger.error({ provider: this.provider.name, error }, 'Market data provider WebSocket error')
    }
  }

  private handleMessage(event: WebSocket.MessageEvent): void {
    try {
      const rawData = JSON.parse(event.data.toString())
      const parsedData = this.provider.parseMessage(rawData)

      if (!parsedData) {
        this.logger.debug({ rawData }, 'Provider message could not be parsed, skipping')
        return
      }

      const message: MarketDataMessage = {
        type: 'price_update',
        source: this.provider.name.toLowerCase(),
        data: parsedData,
        timestamp: Date.now(),
      }

      this.broadcastToClients(message)
      this.logger.debug({ data: parsedData }, 'Forwarded price update to clients')
    } catch (error) {
      this.logger.error(
        {
          provider: this.provider.name,
          error,
          data: event.data,
        },
        'Error processing provider message'
      )
    }
  }

  private broadcastToClients(message: MarketDataMessage): void {
    for (const [clientId, client] of this.clients) {
      try {
        if (client.websocket.readyState === WebSocket.OPEN) {
          // Filter data to only include assets this client requested
          const filteredData: Record<string, string> = {}
          for (const asset of client.assets) {
            if (message.data[asset] !== undefined) {
              filteredData[asset] = message.data[asset]
            }
          }

          // Only send if there's relevant data for this client
          if (Object.keys(filteredData).length > 0) {
            const filteredMessage: MarketDataMessage = {
              ...message,
              data: filteredData,
            }
            client.websocket.send(JSON.stringify(filteredMessage))
          }
        } else {
          this.removeClient(clientId)
        }
      } catch (error) {
        this.logger.error({ clientId, error }, 'Error sending message to client')
        this.removeClient(clientId)
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return
    }

    // Only reconnect if we still have clients
    this.reconnectTimeout = setTimeout(() => {
      if (this.clients.size > 0) {
        this.logger.info({ provider: this.provider.name }, 'Attempting to reconnect to market data provider')
        this.connect()
      } else {
        this.logger.info('No clients connected, skipping provider reconnect')
      }
    }, this.reconnectDelayMs)
  }

  private disconnectFromProvider(): void {
    this.logger.info({ provider: this.provider.name }, 'Disconnecting from market data provider - no more clients')

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = undefined
    }

    if (this.socket) {
      this.socket.close()
      this.socket = undefined
    }
  }

  addClient(websocket: WebSocket, clientId: string, requestedAssets: string[]): void {
    const client: MarketDataClient = {
      id: clientId,
      websocket,
      assets: requestedAssets,
    }

    const wasEmpty = this.clients.size === 0
    this.clients.set(clientId, client)

    // Connect to provider if this is our first client
    if (wasEmpty) {
      this.logger.info({ provider: this.provider.name }, 'First client connected, establishing provider connection')
      this.connect()
    }

    this.logger.info(
      {
        clientId,
        requestedAssets,
        totalClients: this.clients.size,
      },
      'Client connected to market data'
    )

    websocket.on('close', () => {
      this.removeClient(clientId)
    })

    websocket.on('error', (error) => {
      this.logger.error({ clientId, error }, 'Client WebSocket error')
      this.removeClient(clientId)
    })
  }

  private removeClient(clientId: string): void {
    if (this.clients.has(clientId)) {
      this.clients.delete(clientId)
      this.logger.info({ clientId, totalClients: this.clients.size }, 'Client disconnected from market data')

      // Disconnect from provider if no more clients
      if (this.clients.size === 0) {
        this.disconnectFromProvider()
      }
    }
  }

  /**
   * Parse assets from WebSocket URL query parameters
   * Handles both full URLs and relative paths from different environments
   */
  private parseAssetsFromUrl(request: IncomingMessage): string[] {
    try {
      const rawUrl = request.url || ''
      // Use dummy base to handle relative URLs like "/ws/market-data?assets=bitcoin"
      const url = new URL(rawUrl, 'ws://dummy.com')
      const assetsParam = url.searchParams.get('assets')

      if (!assetsParam) {
        return []
      }

      return assetsParam
        .split(',')
        .map((asset) => asset.trim().toLowerCase())
        .filter((asset) => asset.length > 0)
    } catch (error) {
      this.logger.error({ error, url: request.url }, 'Error parsing assets from URL')
      return []
    }
  }

  setupWebSocketServer(server: HttpServer, path = '/market-data'): Server {
    const wsServer = new Server({ server, path })

    wsServer.on('connection', (ws, request) => {
      const clientId = v4()
      const requestedAssets = this.parseAssetsFromUrl(request)
      this.addClient(ws, clientId, requestedAssets)
    })

    this.logger.info({ path }, 'WebSocket server setup complete')
    return wsServer
  }

  disconnect(): void {
    this.logger.info('Shutting down market data WebSocket')

    // Disconnect from provider
    this.disconnectFromProvider()

    // Close all client connections
    for (const [, client] of this.clients) {
      client.websocket.close()
    }

    this.clients.clear()
  }
}

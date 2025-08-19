import { Logger } from '@shapeshiftoss/logger'
import WebSocket, { Server } from 'ws'
import { v4 } from 'uuid'
import { Server as HttpServer } from 'http'
import { IncomingMessage } from 'http'
import { URL } from 'url'

export interface CoinCapMessage {
  type: 'price_update'
  source: 'coincap'
  data: Record<string, string>
  timestamp: number
}

export interface CoinCapClient {
  id: string
  websocket: WebSocket
  assets: string[]
}

export class CoinCapWebSocket {
  private clients = new Map<string, CoinCapClient>()
  private coinCapSocket?: WebSocket
  private reconnectTimeout?: NodeJS.Timeout
  private readonly logger: Logger
  private readonly coinCapUrl: string
  private readonly reconnectDelayMs = 5000

  constructor(logger: Logger, apiKey?: string) {
    this.logger = logger.child({ namespace: ['proxy', 'coincap'] })
    this.coinCapUrl = `wss://wss.coincap.io/prices?assets=ALL&apiKey=${apiKey}`
    // Don't auto-connect - only connect when we have clients
  }

  private connect(): void {
    if (this.coinCapSocket?.readyState === WebSocket.OPEN) {
      return
    }

    this.logger.info({ url: this.coinCapUrl }, 'Connecting to CoinCap WebSocket')
    this.coinCapSocket = new WebSocket(this.coinCapUrl)

    this.coinCapSocket.onopen = () => {
      this.logger.info('Connected to CoinCap WebSocket')
      if (this.reconnectTimeout) {
        clearTimeout(this.reconnectTimeout)
        this.reconnectTimeout = undefined
      }
    }

    this.coinCapSocket.onmessage = (event) => {
      this.handleCoinCapMessage(event)
    }

    this.coinCapSocket.onclose = (event) => {
      this.logger.warn({ code: event.code, reason: event.reason }, 'CoinCap WebSocket closed')
      this.scheduleReconnect()
    }

    this.coinCapSocket.onerror = (error) => {
      this.logger.error({ error }, 'CoinCap WebSocket error')
    }
  }

  private handleCoinCapMessage(event: WebSocket.MessageEvent): void {
    try {
      const data = JSON.parse(event.data.toString())
      const message: CoinCapMessage = {
        type: 'price_update',
        source: 'coincap',
        data,
        timestamp: Date.now(),
      }

      this.broadcastToClients(message)
      this.logger.debug({ data }, 'Forwarded price update to clients')
    } catch (error) {
      this.logger.error({ error, data: event.data }, 'Error processing CoinCap message')
    }
  }

  private broadcastToClients(message: CoinCapMessage): void {
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
            const filteredMessage: CoinCapMessage = {
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
        this.logger.info('Attempting to reconnect to CoinCap WebSocket')
        this.connect()
      } else {
        this.logger.info('No clients connected, skipping CoinCap reconnect')
      }
    }, this.reconnectDelayMs)
  }

  private disconnectFromCoinCap(): void {
    this.logger.info('Disconnecting from CoinCap - no more clients')

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = undefined
    }

    if (this.coinCapSocket) {
      this.coinCapSocket.close()
      this.coinCapSocket = undefined
    }
  }

  addClient(websocket: WebSocket, clientId: string, requestedAssets: string[]): void {
    const client: CoinCapClient = {
      id: clientId,
      websocket,
      assets: requestedAssets,
    }

    const wasEmpty = this.clients.size === 0
    this.clients.set(clientId, client)

    // Connect to CoinCap if this is our first client
    if (wasEmpty) {
      this.logger.info('First client connected, establishing CoinCap connection')
      this.connect()
    }

    this.logger.info(
      {
        clientId,
        requestedAssets,
        totalClients: this.clients.size,
      },
      'Client connected to CoinCap'
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
      this.logger.info({ clientId, totalClients: this.clients.size }, 'Client disconnected from CoinCap')

      // Disconnect from CoinCap if no more clients
      if (this.clients.size === 0) {
        this.disconnectFromCoinCap()
      }
    }
  }

  getClientCount(): number {
    return this.clients.size
  }

  isConnectedToCoinCap(): boolean {
    return this.coinCapSocket?.readyState === WebSocket.OPEN
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
        return ['bitcoin'] // default
      }

      // Simple split and clean - let CoinCap handle invalid assets
      return assetsParam
        .split(',')
        .map((asset) => asset.trim().toLowerCase())
        .filter((asset) => asset.length > 0)
    } catch (error) {
      this.logger.error({ error, url: request.url }, 'Error parsing assets from URL')
      return ['bitcoin'] // fallback
    }
  }

  /**
   * Setup WebSocket server on the given HTTP server - similar to handler pattern used by other proxy services
   */
  setupWebSocketServer(server: HttpServer, path = '/coincap'): Server {
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
    this.logger.info('Shutting down CoinCap WebSocket')

    // Disconnect from CoinCap
    this.disconnectFromCoinCap()

    // Close all client connections
    for (const [, client] of this.clients) {
      client.websocket.close()
    }

    this.clients.clear()
  }
}

import { Logger } from '@shapeshiftoss/logger'
import WebSocket, { Server } from 'ws'
import { v4 } from 'uuid'
import { Server as HttpServer } from 'http'

export interface MarketDataMessage {
  type: 'price_update'
  source: 'coincap'
  data: Record<string, string>
  timestamp: number
}

export interface MarketDataClient {
  id: string
  websocket: WebSocket
  assets: string[]
}

export class MarketDataWebSocket {
  private clients = new Map<string, MarketDataClient>()
  private coinCapSocket?: WebSocket
  private reconnectTimeout?: NodeJS.Timeout
  private readonly logger: Logger
  private readonly coinCapUrl: string
  private readonly assets: string[] = ['bitcoin']
  private readonly reconnectDelayMs = 5000

  constructor(logger: Logger, apiKey?: string) {
    this.logger = logger.child({ namespace: ['proxy', 'marketData'] })
    this.coinCapUrl = this.buildCoinCapUrl(apiKey)
    this.connect()
  }

  private buildCoinCapUrl(apiKey?: string): string {
    const baseUrl = 'wss://wss.coincap.io/prices'
    const assetsParam = `assets=${this.assets.join(',')}`
    const keyParam = apiKey ? `&apiKey=${apiKey}` : ''
    return `${baseUrl}?${assetsParam}${keyParam}`
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
      const message: MarketDataMessage = {
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

  private broadcastToClients(message: MarketDataMessage): void {
    const messageStr = JSON.stringify(message)

    for (const [clientId, client] of this.clients) {
      try {
        if (client.websocket.readyState === WebSocket.OPEN) {
          client.websocket.send(messageStr)
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

    this.reconnectTimeout = setTimeout(() => {
      this.logger.info('Attempting to reconnect to CoinCap WebSocket')
      this.connect()
    }, this.reconnectDelayMs)
  }

  addClient(websocket: WebSocket, clientId: string): void {
    const client: MarketDataClient = {
      id: clientId,
      websocket,
      assets: [...this.assets], // Copy of supported assets
    }

    this.clients.set(clientId, client)
    this.logger.info({ clientId, totalClients: this.clients.size }, 'Client connected to market data')

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
    }
  }

  getClientCount(): number {
    return this.clients.size
  }

  isConnectedToCoinCap(): boolean {
    return this.coinCapSocket?.readyState === WebSocket.OPEN
  }

  /**
   * Setup WebSocket server on the given HTTP server - similar to handler pattern used by other proxy services
   */
  setupWebSocketServer(server: HttpServer, path = '/ws/market-data'): Server {
    const wsServer = new Server({ server, path })

    wsServer.on('connection', (ws) => {
      const clientId = v4()
      this.addClient(ws, clientId)
    })

    this.logger.info({ path }, 'WebSocket server setup complete')
    return wsServer
  }

  disconnect(): void {
    this.logger.info('Shutting down market data WebSocket')

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = undefined
    }

    if (this.coinCapSocket) {
      this.coinCapSocket.close()
    }

    for (const [, client] of this.clients) {
      client.websocket.close()
    }

    this.clients.clear()
  }
}

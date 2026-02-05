/**
 * OpenClaw Gateway WebSocket Client
 * Connects to the Gateway for real-time events and control operations
 * 
 * Issue: #30 WebSocket Client Integration
 */

export interface GatewayConfig {
  url?: string
  token?: string
  reconnectInterval?: number
  maxReconnectAttempts?: number
}

export interface GatewayMessage {
  type: 'req' | 'res' | 'event'
  id?: string
  method?: string
  params?: Record<string, unknown>
  ok?: boolean
  payload?: unknown
  error?: { message: string; code?: string }
  event?: string
  seq?: number
  stateVersion?: Record<string, number>
}

export interface PresenceEntry {
  instanceId: string
  host: string
  ip?: string
  version: string
  mode: string
  deviceFamily?: string
  lastInputSeconds?: number
  ts: number
}

export interface HealthSnapshot {
  gateway: {
    status: string
    uptime: number
    version: string
  }
  agents: Record<string, { status: string; lastActivity?: number }>
}

export interface HelloPayload {
  type: 'hello-ok'
  protocol: number
  snapshot: {
    presence: PresenceEntry[]
    health: HealthSnapshot
    stateVersion: Record<string, number>
    uptimeMs: number
  }
  policy: {
    maxPayload: number
    tickIntervalMs: number
  }
}

type EventHandler = (payload: unknown, seq?: number, stateVersion?: Record<string, number>) => void
type ConnectionHandler = (connected: boolean) => void

export class GatewayWebSocket {
  private ws: WebSocket | null = null
  private config: Required<GatewayConfig>
  private pendingRequests = new Map<string, { 
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeout: ReturnType<typeof setTimeout>
  }>()
  private eventHandlers = new Map<string, Set<EventHandler>>()
  private connectionHandlers = new Set<ConnectionHandler>()
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isConnected = false
  private snapshot: HelloPayload['snapshot'] | null = null

  constructor(config: GatewayConfig = {}) {
    this.config = {
      url: config.url ?? `ws://${window.location.hostname}:18789`,
      token: config.token ?? '',
      reconnectInterval: config.reconnectInterval ?? 3000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 10,
    }
  }

  async connect(): Promise<HelloPayload['snapshot']> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.url)
        
        this.ws.onopen = () => {
          console.log('[GatewayWS] Connected, sending handshake...')
          this.sendHandshake()
            .then((hello) => {
              this.isConnected = true
              this.reconnectAttempts = 0
              this.snapshot = hello.snapshot
              this.notifyConnectionHandlers(true)
              resolve(hello.snapshot)
            })
            .catch(reject)
        }

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data)
        }

        this.ws.onerror = (error) => {
          console.error('[GatewayWS] Error:', error)
        }

        this.ws.onclose = () => {
          console.log('[GatewayWS] Disconnected')
          this.isConnected = false
          this.notifyConnectionHandlers(false)
          this.scheduleReconnect()
        }
      } catch (error) {
        reject(error)
      }
    })
  }

  private async sendHandshake(): Promise<HelloPayload> {
    const response = await this.request('connect', {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: 'reef-dashboard',
        version: '1.0.0',
        platform: 'web',
        mode: 'operator',
        instanceId: this.generateInstanceId(),
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      auth: this.config.token ? { token: this.config.token } : undefined,
    })
    return response as HelloPayload
  }

  private generateInstanceId(): string {
    const stored = sessionStorage.getItem('reef-instance-id')
    if (stored) return stored
    const id = `reef-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    sessionStorage.setItem('reef-instance-id', id)
    return id
  }

  private handleMessage(data: string) {
    try {
      const msg: GatewayMessage = JSON.parse(data)

      if (msg.type === 'res') {
        const pending = this.pendingRequests.get(msg.id!)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(msg.id!)
          if (msg.ok) {
            pending.resolve(msg.payload)
          } else {
            pending.reject(new Error(msg.error?.message ?? 'Unknown error'))
          }
        }
      } else if (msg.type === 'event') {
        this.emit(msg.event!, msg.payload, msg.seq, msg.stateVersion)
      }
    } catch (error) {
      console.error('[GatewayWS] Failed to parse message:', error)
    }
  }

  async request<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs = 30000): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, { 
        resolve: resolve as (value: unknown) => void, 
        reject, 
        timeout 
      })

      this.ws!.send(JSON.stringify({
        type: 'req',
        id,
        method,
        params,
      }))
    })
  }

  // Event subscription
  on(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  off(event: string, handler: EventHandler) {
    this.eventHandlers.get(event)?.delete(handler)
  }

  private emit(event: string, payload: unknown, seq?: number, stateVersion?: Record<string, number>) {
    this.eventHandlers.get(event)?.forEach(h => h(payload, seq, stateVersion))
    this.eventHandlers.get('*')?.forEach(h => h({ event, payload }, seq, stateVersion))
  }

  // Connection state
  onConnection(handler: ConnectionHandler): () => void {
    this.connectionHandlers.add(handler)
    // Immediately notify of current state
    handler(this.isConnected)
    return () => this.connectionHandlers.delete(handler)
  }

  private notifyConnectionHandlers(connected: boolean) {
    this.connectionHandlers.forEach(h => h(connected))
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('[GatewayWS] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.config.reconnectInterval * Math.min(this.reconnectAttempts, 5)
    console.log(`[GatewayWS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect().catch(console.error)
    }, delay)
  }

  // Convenience methods for common operations
  async getHealth(): Promise<HealthSnapshot> {
    return this.request('health')
  }

  async getPresence(): Promise<PresenceEntry[]> {
    const result = await this.request<{ entries: PresenceEntry[] }>('system-presence')
    return result.entries
  }

  async getSessions(): Promise<unknown[]> {
    const result = await this.request<{ sessions: unknown[] }>('sessions.list')
    return result.sessions
  }

  async getChatHistory(sessionKey: string): Promise<unknown[]> {
    const result = await this.request<{ messages: unknown[] }>('chat.history', { sessionKey })
    return result.messages
  }

  async sendMessage(sessionKey: string, message: string): Promise<{ runId: string }> {
    return this.request('chat.send', {
      sessionKey,
      message,
      idempotencyKey: `reef-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    })
  }

  async abortRun(sessionKey: string): Promise<void> {
    await this.request('chat.abort', { sessionKey })
  }

  async tailLogs(follow = true): Promise<void> {
    await this.request('logs.tail', { follow })
  }

  getSnapshot(): HelloPayload['snapshot'] | null {
    return this.snapshot
  }

  getConnectionState(): boolean {
    return this.isConnected
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }
}

// Singleton instance
let gatewayInstance: GatewayWebSocket | null = null

export function getGateway(config?: GatewayConfig): GatewayWebSocket {
  if (!gatewayInstance) {
    gatewayInstance = new GatewayWebSocket(config)
  }
  return gatewayInstance
}

export function resetGateway(): void {
  if (gatewayInstance) {
    gatewayInstance.disconnect()
    gatewayInstance = null
  }
}

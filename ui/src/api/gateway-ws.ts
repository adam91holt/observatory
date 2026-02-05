/**
 * OpenClaw Gateway WebSocket Client
 *
 * Production-quality WebSocket client for the OpenClaw Gateway (port 18789).
 * Handles:
 *  - Token-based authentication handshake
 *  - Event subscriptions (health, presence, sessions)
 *  - Request/response RPC pattern
 *  - Streaming support for chat and logs
 *  - Automatic reconnection with exponential backoff
 *  - Keep-alive pings
 *
 * Issue: #30 WebSocket Client Integration
 */

import {
  type ConnectionState,
  type GatewayClientOptions,
  type GatewayCallbacks,
  type GatewaySnapshot,
  type HealthSnapshot,
  type PresenceEntry,
  type HelloOkPayload,
  type WebSocketMessage,
  type EventHandler,
  DEFAULT_OPTIONS,
  makeRequestId,
  getInstanceId,
  backoffDelay,
  parseMessage,
} from '@/lib/websocket'

// ---------------------------------------------------------------------------
//  Pending request tracking
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

// ---------------------------------------------------------------------------
//  Streaming support
// ---------------------------------------------------------------------------

export interface StreamSubscription {
  /** Unique ID for this stream subscription */
  id: string
  /** Unsubscribe and stop receiving chunks */
  unsubscribe: () => void
}

type StreamHandler = (chunk: unknown) => void
type StreamEndHandler = (final?: unknown) => void
type StreamErrorHandler = (error: Error) => void

interface StreamState {
  onChunk: StreamHandler
  onEnd?: StreamEndHandler
  onError?: StreamErrorHandler
}

// ---------------------------------------------------------------------------
//  Main client class
// ---------------------------------------------------------------------------

export class OpenClawWebSocket {
  private ws: WebSocket | null = null
  private readonly pendingRequests = new Map<string, PendingRequest>()
  private readonly eventHandlers = new Map<string, Set<EventHandler>>()
  private readonly streams = new Map<string, StreamState>()

  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private intentionalClose = false

  private _state: ConnectionState = 'disconnected'
  private _snapshot: GatewaySnapshot | null = null

  private opts: Required<GatewayClientOptions> = { ...DEFAULT_OPTIONS }
  private callbacks: GatewayCallbacks = {}

  // -----------------------------------------------------------------------
  //  Public getters
  // -----------------------------------------------------------------------

  get state(): ConnectionState {
    return this._state
  }

  get snapshot(): GatewaySnapshot | null {
    return this._snapshot
  }

  get isConnected(): boolean {
    return this._state === 'connected' && this.ws?.readyState === WebSocket.OPEN
  }

  // -----------------------------------------------------------------------
  //  Lifecycle
  // -----------------------------------------------------------------------

  /**
   * Open connection and perform handshake.
   * Returns the initial snapshot on success.
   */
  async connect(params: GatewayClientOptions & GatewayCallbacks): Promise<GatewaySnapshot> {
    // Merge options
    this.opts = { ...DEFAULT_OPTIONS, ...params }
    this.callbacks = {
      onStateChange: params.onStateChange,
      onEvent: params.onEvent,
      onSnapshot: params.onSnapshot,
      onError: params.onError,
    }
    this.intentionalClose = false

    return this._doConnect()
  }

  /** Gracefully close the connection. No reconnection will be attempted. */
  disconnect(): void {
    this.intentionalClose = true
    this._setState('disconnected')
    this._cleanup()
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
  }

  // -----------------------------------------------------------------------
  //  RPC request/response
  // -----------------------------------------------------------------------

  /**
   * Send a request and wait for the matching response.
   * Rejects on timeout or error response.
   */
  async request<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected')
    }

    const id = makeRequestId()
    const timeout = timeoutMs ?? this.opts.defaultRequestTimeoutMs

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout: ${method}`))
      }, timeout)

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timer,
      })

      this.ws!.send(
        JSON.stringify({ type: 'req', id, method, params }),
      )
    })
  }

  // -----------------------------------------------------------------------
  //  Event subscriptions
  // -----------------------------------------------------------------------

  /**
   * Subscribe to a named event (e.g. 'health', 'presence', 'agent').
   * Pass '*' to receive all events.
   * Returns an unsubscribe function.
   */
  on(event: string, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set())
    }
    this.eventHandlers.get(event)!.add(handler)
    return () => this.off(event, handler)
  }

  /** Remove a specific handler for an event, or all handlers for that event. */
  off(event: string, handler?: EventHandler): void {
    if (handler) {
      this.eventHandlers.get(event)?.delete(handler)
    } else {
      this.eventHandlers.delete(event)
    }
  }

  // -----------------------------------------------------------------------
  //  Streaming support (chat, logs)
  // -----------------------------------------------------------------------

  /**
   * Open a streaming request. The Gateway responds with sequential chunks
   * via events tagged with the request's streamId.
   *
   * Example: chat.send returns a runId and streams assistant chunks.
   */
  openStream(
    method: string,
    params: Record<string, unknown>,
    handlers: {
      onChunk: StreamHandler
      onEnd?: StreamEndHandler
      onError?: StreamErrorHandler
    },
  ): StreamSubscription {
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

    this.streams.set(streamId, {
      onChunk: handlers.onChunk,
      onEnd: handlers.onEnd,
      onError: handlers.onError,
    })

    // Fire the request. Response is not awaited — chunks arrive as events.
    this.request(method, { ...params, _streamId: streamId }).catch((err) => {
      handlers.onError?.(err instanceof Error ? err : new Error(String(err)))
      this.streams.delete(streamId)
    })

    return {
      id: streamId,
      unsubscribe: () => {
        this.streams.delete(streamId)
      },
    }
  }

  // -----------------------------------------------------------------------
  //  Convenience methods
  // -----------------------------------------------------------------------

  /** Request the current health snapshot */
  async getHealth(): Promise<HealthSnapshot> {
    return this.request<HealthSnapshot>('health')
  }

  /** Request the current presence list */
  async getPresence(): Promise<PresenceEntry[]> {
    const result = await this.request<{ entries: PresenceEntry[] }>('system-presence')
    return result.entries
  }

  /** List all sessions (polling — no push event for sessions) */
  async getSessions(): Promise<unknown[]> {
    const result = await this.request<{ sessions: unknown[] }>('sessions.list')
    return result.sessions
  }

  /** Fetch chat history for a session */
  async getChatHistory(sessionKey: string): Promise<unknown[]> {
    const result = await this.request<{ messages: unknown[] }>('chat.history', { sessionKey })
    return result.messages
  }

  /**
   * Send a message to an agent session.
   * Returns immediately with a runId; response chunks arrive via events.
   */
  async sendMessage(
    sessionKey: string,
    message: string,
  ): Promise<{ runId: string }> {
    return this.request<{ runId: string }>('chat.send', {
      sessionKey,
      message,
      idempotencyKey: `reef-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    })
  }

  /** Abort a running agent session */
  async abortRun(sessionKey: string): Promise<void> {
    await this.request('chat.abort', { sessionKey })
  }

  /** Start tailing logs. Events arrive via the 'log' event. */
  async tailLogs(follow = true): Promise<void> {
    await this.request('logs.tail', { follow })
  }

  /** Get the initial snapshot received during handshake */
  getSnapshot(): GatewaySnapshot | null {
    return this._snapshot
  }

  /** Get the current connection state */
  getConnectionState(): ConnectionState {
    return this._state
  }

  // -----------------------------------------------------------------------
  //  Internal: connection
  // -----------------------------------------------------------------------

  private async _doConnect(): Promise<GatewaySnapshot> {
    this._setState('connecting')

    return new Promise<GatewaySnapshot>((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.opts.url)

        this.ws.onopen = () => {
          this._performHandshake()
            .then((hello) => {
              this._snapshot = hello.snapshot
              this.reconnectAttempts = 0
              this._setState('connected')
              this._startPing()
              this.callbacks.onSnapshot?.(hello.snapshot)
              resolve(hello.snapshot)
            })
            .catch((err) => {
              this._setState('error')
              reject(err)
            })
        }

        this.ws.onmessage = (event) => {
          const msg = parseMessage(event.data as string)
          if (msg) this._handleMessage(msg)
        }

        this.ws.onerror = () => {
          this.callbacks.onError?.(new Error('WebSocket error'))
        }

        this.ws.onclose = (event) => {
          console.log(`[WS] Closed: ${event.code} ${event.reason}`)
          const wasConnected = this._state === 'connected'
          this._cleanup()

          if (!this.intentionalClose) {
            if (wasConnected) {
              this._setState('disconnected')
            }
            this._attemptReconnect()
          }
        }
      } catch (error) {
        this._setState('error')
        reject(error)
      }
    })
  }

  private async _performHandshake(): Promise<HelloOkPayload> {
    const authParams: Record<string, string> = {}
    if (this.opts.token) {
      authParams.token = this.opts.token
    } else if (this.opts.password) {
      authParams.password = this.opts.password
    }

    const response = await this.request<HelloOkPayload>('connect', {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: this.opts.clientId,
        version: this.opts.clientVersion,
        platform: 'web',
        mode: 'operator',
        instanceId: getInstanceId(),
      },
      role: 'operator',
      scopes: ['operator.read', 'operator.write'],
      auth: Object.keys(authParams).length > 0 ? authParams : undefined,
    })

    if (response.type !== 'hello-ok') {
      throw new Error(`Unexpected handshake response: ${String((response as Record<string, unknown>).type)}`)
    }

    return response
  }

  // -----------------------------------------------------------------------
  //  Internal: message routing
  // -----------------------------------------------------------------------

  private _handleMessage(msg: WebSocketMessage): void {
    switch (msg.type) {
      case 'res':
        this._handleResponse(msg)
        break
      case 'event':
        this._handleEvent(msg)
        break
      default:
        // Ignore unknown message types (future-proof)
        break
    }
  }

  private _handleResponse(msg: WebSocketMessage & { type: 'res' }): void {
    const pending = this.pendingRequests.get(msg.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(msg.id)

    if (msg.ok) {
      pending.resolve(msg.payload)
    } else {
      pending.reject(new Error(msg.error?.message ?? 'Request failed'))
    }
  }

  private _handleEvent(msg: WebSocketMessage & { type: 'event' }): void {
    const { event, payload, seq, stateVersion } = msg

    // Forward to owner callback
    this.callbacks.onEvent?.(event, payload, seq, stateVersion)

    // Emit to registered event handlers
    this.eventHandlers.get(event)?.forEach((h) => h(payload, seq, stateVersion))
    // Wildcard handlers
    this.eventHandlers.get('*')?.forEach((h) => h({ event, payload }, seq, stateVersion))

    // Update internal snapshot for core events
    this._updateSnapshot(event, payload, stateVersion)

    // Route to stream handlers if applicable
    this._routeToStream(payload)
  }

  private _updateSnapshot(
    event: string,
    payload: unknown,
    stateVersion?: Record<string, number>,
  ): void {
    if (!this._snapshot) return

    if (event === 'health' && payload) {
      this._snapshot = {
        ...this._snapshot,
        health: payload as HealthSnapshot,
        stateVersion: {
          ...this._snapshot.stateVersion,
          ...(stateVersion?.health !== undefined ? { health: stateVersion.health } : {}),
        },
      }
    } else if (event === 'presence' && payload) {
      const presencePayload = payload as { entries?: PresenceEntry[] }
      if (presencePayload.entries) {
        this._snapshot = {
          ...this._snapshot,
          presence: presencePayload.entries,
          stateVersion: {
            ...this._snapshot.stateVersion,
            ...(stateVersion?.presence !== undefined ? { presence: stateVersion.presence } : {}),
          },
        }
      }
    }
  }

  private _routeToStream(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return

    const record = payload as Record<string, unknown>
    const streamId = record._streamId as string | undefined
    if (!streamId) return

    const stream = this.streams.get(streamId)
    if (!stream) return

    if (record._streamEnd) {
      stream.onEnd?.(record)
      this.streams.delete(streamId)
    } else if (record._streamError) {
      stream.onError?.(new Error(String(record._streamError)))
      this.streams.delete(streamId)
    } else {
      stream.onChunk(record)
    }
  }

  // -----------------------------------------------------------------------
  //  Internal: reconnection
  // -----------------------------------------------------------------------

  private _attemptReconnect(): void {
    if (this.reconnectTimer) return
    if (this.reconnectAttempts >= this.opts.maxReconnectAttempts) {
      console.error(`[WS] Max reconnect attempts (${this.opts.maxReconnectAttempts}) reached`)
      this._setState('error')
      return
    }

    this.reconnectAttempts++
    const delay = backoffDelay(
      this.reconnectAttempts,
      this.opts.baseReconnectDelay,
      this.opts.maxReconnectDelay,
    )

    console.log(
      `[WS] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts}/${this.opts.maxReconnectAttempts})`,
    )

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this._doConnect().catch((error) => {
        console.error('[WS] Reconnect failed:', error)
      })
    }, delay)
  }

  // -----------------------------------------------------------------------
  //  Internal: keep-alive
  // -----------------------------------------------------------------------

  private _startPing(): void {
    this._stopPing()
    this.pingInterval = setInterval(() => {
      if (this.isConnected) {
        this.request('status').catch((err) => {
          console.warn('[WS] Ping failed:', err)
        })
      }
    }, this.opts.pingIntervalMs)
  }

  private _stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  // -----------------------------------------------------------------------
  //  Internal: state management
  // -----------------------------------------------------------------------

  private _setState(state: ConnectionState): void {
    if (this._state !== state) {
      this._state = state
      this.callbacks.onStateChange?.(state)
    }
  }

  private _cleanup(): void {
    this._stopPing()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Connection closed'))
      this.pendingRequests.delete(id)
    }

    // Notify all streams of error
    for (const [id, stream] of this.streams) {
      stream.onError?.(new Error('Connection closed'))
      this.streams.delete(id)
    }
  }
}

// ---------------------------------------------------------------------------
//  Singleton management is in '@/lib/websocket' to maintain backward
//  compatibility with existing imports (e.g. store/auth.ts).
//  Use: import { getWebSocketClient, resetWebSocketClient } from '@/lib/websocket'
// ---------------------------------------------------------------------------

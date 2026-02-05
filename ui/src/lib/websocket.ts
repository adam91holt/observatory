/**
 * WebSocket Protocol Types & Helpers for OpenClaw Gateway
 * Defines the wire protocol, message shapes, and shared utilities
 *
 * Issue: #30 WebSocket Client Integration
 */

// ---------------------------------------------------------------------------
//  Connection state
// ---------------------------------------------------------------------------

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

// ---------------------------------------------------------------------------
//  Wire protocol messages
// ---------------------------------------------------------------------------

/** Outbound request from client → Gateway */
export interface WsRequest {
  type: 'req'
  id: string
  method: string
  params?: Record<string, unknown>
}

/** Inbound response from Gateway → client */
export interface WsResponse {
  type: 'res'
  id: string
  ok: boolean
  payload?: unknown
  error?: { code: string; message: string }
}

/** Inbound push event from Gateway → client */
export interface WsEvent {
  type: 'event'
  event: string
  payload: unknown
  seq?: number
  stateVersion?: Record<string, number>
}

export type WebSocketMessage = WsRequest | WsResponse | WsEvent

// ---------------------------------------------------------------------------
//  Domain types
// ---------------------------------------------------------------------------

export interface PresenceEntry {
  instanceId: string
  host: string
  ip?: string
  version?: string
  mode: string
  deviceFamily?: string
  lastInputSeconds?: number
  ts: number
}

export interface HealthSnapshot {
  status: 'healthy' | 'degraded' | 'unhealthy'
  components: Record<string, { status: string; message?: string }>
}

export interface GatewaySnapshot {
  presence: PresenceEntry[]
  health: HealthSnapshot
  stateVersion: { presence: number; health: number }
  uptimeMs: number
}

// ---------------------------------------------------------------------------
//  Handshake types
// ---------------------------------------------------------------------------

export interface ConnectParams {
  minProtocol: number
  maxProtocol: number
  client: {
    id: string
    version: string
    platform: string
    mode: string
    instanceId: string
  }
  role: string
  scopes: string[]
  auth?: { token?: string; password?: string }
}

export interface HelloOkPayload {
  type: 'hello-ok'
  protocol: number
  snapshot: GatewaySnapshot
  policy: {
    maxPayload: number
    tickIntervalMs: number
  }
}

// ---------------------------------------------------------------------------
//  Client configuration
// ---------------------------------------------------------------------------

export interface GatewayClientOptions {
  /** WebSocket URL. Defaults to ws://<location.hostname>:18789 */
  url?: string
  /** Authentication token (optional for localhost) */
  token?: string
  /** Authentication password (alternative to token) */
  password?: string
  /** Client identifier sent during handshake */
  clientId?: string
  /** Client version sent during handshake */
  clientVersion?: string
  /** Maximum reconnection attempts before giving up */
  maxReconnectAttempts?: number
  /** Base delay in ms for exponential backoff (default 1000) */
  baseReconnectDelay?: number
  /** Maximum reconnect delay cap in ms (default 30000) */
  maxReconnectDelay?: number
  /** Interval in ms for keep-alive pings (default 30000) */
  pingIntervalMs?: number
  /** Default timeout for RPC requests in ms (default 30000) */
  defaultRequestTimeoutMs?: number
}

export const DEFAULT_OPTIONS: Required<GatewayClientOptions> = {
  url: typeof window !== 'undefined' ? `ws://${window.location.hostname}:18789` : 'ws://127.0.0.1:18789',
  token: '',
  password: '',
  clientId: 'observatory-dashboard',
  clientVersion: '1.0.0',
  maxReconnectAttempts: 10,
  baseReconnectDelay: 1000,
  maxReconnectDelay: 30_000,
  pingIntervalMs: 30_000,
  defaultRequestTimeoutMs: 30_000,
}

// ---------------------------------------------------------------------------
//  Callback signatures
// ---------------------------------------------------------------------------

export type EventHandler = (
  payload: unknown,
  seq?: number,
  stateVersion?: Record<string, number>,
) => void

export type StateChangeHandler = (state: ConnectionState) => void

export type SnapshotHandler = (snapshot: GatewaySnapshot) => void

export type ErrorHandler = (error: Error) => void

/** All callbacks that the client owner can subscribe to */
export interface GatewayCallbacks {
  onStateChange?: StateChangeHandler
  onEvent?: (event: string, payload: unknown, seq?: number, stateVersion?: Record<string, number>) => void
  onSnapshot?: SnapshotHandler
  onError?: ErrorHandler
}

// ---------------------------------------------------------------------------
//  Agent stream event types (for useAgentEvents hook)
// ---------------------------------------------------------------------------

export interface AgentEvent {
  stream: 'tool' | 'assistant' | 'lifecycle'
  runId?: string
  sessionKey?: string
}

export interface AgentToolEvent extends AgentEvent {
  stream: 'tool'
  event: 'start' | 'update' | 'end'
  toolName: string
  toolId?: string
  input?: unknown
  output?: unknown
  error?: string
  durationMs?: number
}

export interface AgentAssistantEvent extends AgentEvent {
  stream: 'assistant'
  delta?: string
  content?: string
}

export interface AgentLifecycleEvent extends AgentEvent {
  stream: 'lifecycle'
  phase: 'start' | 'end' | 'error'
  error?: string
  summary?: {
    tokensIn?: number
    tokensOut?: number
    cost?: number
    durationMs?: number
  }
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Generate a unique request ID */
let _reqCounter = 0
export function makeRequestId(): string {
  return `req-${++_reqCounter}-${Date.now()}`
}

/** Get or create a stable browser instance ID */
export function getInstanceId(): string {
  const key = 'observatory-instance-id'
  let instanceId = localStorage.getItem(key)
  if (!instanceId) {
    instanceId = `web-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    localStorage.setItem(key, instanceId)
  }
  return instanceId
}

/** Calculate exponential backoff delay with jitter */
export function backoffDelay(attempt: number, base: number, max: number): number {
  const exponential = base * Math.pow(2, attempt - 1)
  const jitter = exponential * 0.1 * Math.random()
  return Math.min(exponential + jitter, max)
}

/** Parse a raw WebSocket message string into a typed message */
export function parseMessage(data: string): WebSocketMessage | null {
  try {
    return JSON.parse(data) as WebSocketMessage
  } catch {
    console.error('[WS] Failed to parse message:', data.slice(0, 200))
    return null
  }
}

// ---------------------------------------------------------------------------
//  Singleton management
//  store/auth.ts imports getWebSocketClient / resetWebSocketClient from here.
//  The OpenClawWebSocket class is in '@/api/gateway-ws' but we import it here
//  so this module remains the single source of truth for other consumers.
//  Vite/ESM handles the circular reference fine because access is deferred
//  to function call time (not module init time).
// ---------------------------------------------------------------------------

import { OpenClawWebSocket } from '@/api/gateway-ws'

let _instance: OpenClawWebSocket | null = null

/** Get (or create) the singleton WebSocket client */
export function getWebSocketClient(): OpenClawWebSocket {
  if (!_instance) {
    _instance = new OpenClawWebSocket()
  }
  return _instance
}

/** Disconnect and destroy the singleton */
export function resetWebSocketClient(): void {
  if (_instance) {
    _instance.disconnect()
    _instance = null
  }
}

/**
 * React Hooks for Gateway WebSocket
 *
 * Provides ergonomic hooks for components to:
 *  - Subscribe to specific Gateway events
 *  - Make RPC requests
 *  - Read real-time health/presence/connection state
 *  - Stream agent events (tool, assistant, lifecycle)
 *  - Poll for session list updates
 *
 * Issue: #30 WebSocket Client Integration
 */

import { useEffect, useCallback, useState, useRef } from 'react'
import { useAuthStore, useGatewayClient } from '@/store/auth'
import type {
  ConnectionState,
  AgentToolEvent,
  AgentAssistantEvent,
  AgentLifecycleEvent,
  PresenceEntry,
  HealthSnapshot,
} from '@/lib/websocket'
import type { AgentEvent } from '@/lib/websocket'

// ---------------------------------------------------------------------------
//  useGatewayEvent — subscribe to a single named event
// ---------------------------------------------------------------------------

/**
 * Subscribe to a specific Gateway event while the component is mounted
 * and the WebSocket is connected.
 *
 * @example
 * useGatewayEvent<HealthSnapshot>('health', (payload) => {
 *   setHealth(payload)
 * })
 */
export function useGatewayEvent<T = unknown>(
  event: string,
  handler: (payload: T, seq?: number, stateVersion?: Record<string, number>) => void,
  deps: React.DependencyList = [],
): void {
  const { client, isConnected } = useGatewayClient()

  // Stable ref so we don't re-subscribe on every render
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!client || !isConnected) return

    const unsubscribe = client.on(
      event,
      (payload: unknown, seq?: number, stateVersion?: Record<string, number>) => {
        handlerRef.current(payload as T, seq, stateVersion)
      },
    )

    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, isConnected, event, ...deps])
}

// ---------------------------------------------------------------------------
//  useGatewayRequest — imperative RPC caller
// ---------------------------------------------------------------------------

interface RequestState {
  isLoading: boolean
  error: Error | null
}

/**
 * Returns a `request` function for making Gateway RPC calls,
 * plus loading / error state.
 *
 * @example
 * const { request, isLoading } = useGatewayRequest()
 * const sessions = await request<{ sessions: Session[] }>('sessions.list')
 */
export function useGatewayRequest() {
  const { client, isConnected } = useGatewayClient()
  const [state, setState] = useState<RequestState>({ isLoading: false, error: null })

  const request = useCallback(
    async <T = unknown>(
      method: string,
      params?: Record<string, unknown>,
      timeoutMs?: number,
    ): Promise<T | null> => {
      if (!client || !isConnected) {
        const err = new Error('Not connected to Gateway')
        setState({ isLoading: false, error: err })
        return null
      }

      setState({ isLoading: true, error: null })

      try {
        const result = await client.request<T>(method, params, timeoutMs)
        setState({ isLoading: false, error: null })
        return result
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Request failed')
        setState({ isLoading: false, error })
        return null
      }
    },
    [client, isConnected],
  )

  return { request, isLoading: state.isLoading, error: state.error }
}

// ---------------------------------------------------------------------------
//  useGatewayState — real-time health / presence / connection
// ---------------------------------------------------------------------------

/**
 * Provides the current Gateway connection state, health, and presence
 * — all updated in real-time via event subscriptions.
 *
 * @example
 * const { isConnected, health, presence } = useGatewayState()
 */
export function useGatewayState() {
  const { connectionState, gatewaySnapshot } = useAuthStore()
  const [health, setHealth] = useState<HealthSnapshot | null>(
    gatewaySnapshot?.health ?? null,
  )
  const [presence, setPresence] = useState<PresenceEntry[]>(
    gatewaySnapshot?.presence ?? [],
  )

  // Sync from snapshot changes
  useEffect(() => {
    if (gatewaySnapshot) {
      setHealth(gatewaySnapshot.health)
      setPresence(gatewaySnapshot.presence)
    }
  }, [gatewaySnapshot])

  // Subscribe to live health events
  useGatewayEvent<HealthSnapshot>('health', (payload) => {
    if (payload) setHealth(payload)
  })

  // Subscribe to live presence events
  useGatewayEvent<{ entries: PresenceEntry[] }>('presence', (payload) => {
    if (payload?.entries) setPresence(payload.entries)
  })

  return {
    connectionState: connectionState as ConnectionState,
    health,
    presence,
    isConnected: connectionState === 'connected',
    isHealthy: health?.status === 'healthy',
  }
}

// ---------------------------------------------------------------------------
//  useAgentEvents — structured agent stream subscriptions
// ---------------------------------------------------------------------------

/**
 * Subscribe to agent events, split by stream type.
 *
 * @example
 * useAgentEvents({
 *   onTool: (e) => console.log('tool:', e.toolName),
 *   onAssistant: (e) => console.log('assistant delta:', e.delta),
 *   onLifecycle: (e) => console.log('phase:', e.phase),
 * })
 */
export function useAgentEvents(
  onToolEvent?: (payload: AgentToolEvent) => void,
  onAssistantEvent?: (payload: AgentAssistantEvent) => void,
  onLifecycleEvent?: (payload: AgentLifecycleEvent) => void,
): void {
  useGatewayEvent<AgentEvent>('agent', (payload) => {
    if (!payload) return

    switch (payload.stream) {
      case 'tool':
        onToolEvent?.(payload as AgentToolEvent)
        break
      case 'assistant':
        onAssistantEvent?.(payload as AgentAssistantEvent)
        break
      case 'lifecycle':
        onLifecycleEvent?.(payload as AgentLifecycleEvent)
        break
    }
  }, [onToolEvent, onAssistantEvent, onLifecycleEvent])
}

// ---------------------------------------------------------------------------
//  useSessionsRealTime — session list polling
// ---------------------------------------------------------------------------

interface SessionEntry {
  agentId: string
  sessionKey: string
  sessionId: string
  updatedAt: number
  displayName?: string
}

/**
 * Wraps an initial session list and polls for updates every `intervalMs`.
 * Sessions don't have a push event, so polling is the way.
 *
 * @param initialSessions - The initial set from a REST fetch
 * @param intervalMs - Polling interval (default 30 000)
 */
export function useSessionsRealTime(
  initialSessions: SessionEntry[],
  intervalMs = 30_000,
): SessionEntry[] {
  const [sessions, setSessions] = useState(initialSessions)
  const { request } = useGatewayRequest()

  // Sync when initial list changes (e.g. from react-query)
  useEffect(() => {
    setSessions(initialSessions)
  }, [initialSessions])

  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await request<{ sessions: SessionEntry[] }>('sessions.list')
      if (result?.sessions) {
        setSessions(result.sessions)
      }
    }, intervalMs)

    return () => clearInterval(interval)
  }, [request, intervalMs])

  return sessions
}

// ---------------------------------------------------------------------------
//  Re-exports for convenience
// ---------------------------------------------------------------------------

export type {
  AgentEvent,
  AgentToolEvent,
  AgentAssistantEvent,
  AgentLifecycleEvent,
}

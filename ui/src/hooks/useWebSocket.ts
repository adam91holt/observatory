/**
 * WebSocket Hooks for Real-Time Updates
 * Issue: #30 WebSocket Client Integration
 */

import { useEffect, useCallback, useState } from 'react'
import { useAuthStore, useGatewayClient } from '@/store/auth'
import { getWebSocketClient, type GatewaySnapshot, type ConnectionState } from '@/lib/websocket'

/**
 * Hook to subscribe to Gateway events
 */
export function useGatewayEvent<T = unknown>(
  event: string,
  handler: (payload: T, seq?: number, stateVersion?: Record<string, number>) => void,
  deps: React.DependencyList = []
) {
  const { client, isConnected } = useGatewayClient()

  useEffect(() => {
    if (!client || !isConnected) return

    const unsubscribe = client.on(event, handler as (payload: unknown, seq?: number, stateVersion?: Record<string, number>) => void)
    return unsubscribe
  }, [client, isConnected, event, ...deps])
}

/**
 * Hook to make Gateway requests
 */
export function useGatewayRequest() {
  const { client, isConnected } = useGatewayClient()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const request = useCallback(
    async <T = unknown>(method: string, params?: Record<string, unknown>): Promise<T | null> => {
      if (!client || !isConnected) {
        setError(new Error('Not connected to Gateway'))
        return null
      }

      setIsLoading(true)
      setError(null)

      try {
        const result = await client.request<T>(method, params)
        return result
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Request failed'))
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [client, isConnected]
  )

  return { request, isLoading, error }
}

/**
 * Hook to get current Gateway state
 */
export function useGatewayState() {
  const { connectionState, gatewaySnapshot } = useAuthStore()
  const [health, setHealth] = useState(gatewaySnapshot?.health ?? null)
  const [presence, setPresence] = useState(gatewaySnapshot?.presence ?? [])

  // Update from snapshot changes
  useEffect(() => {
    if (gatewaySnapshot) {
      setHealth(gatewaySnapshot.health)
      setPresence(gatewaySnapshot.presence)
    }
  }, [gatewaySnapshot])

  // Subscribe to health events
  useGatewayEvent('health', (payload) => {
    setHealth(payload as typeof health)
  })

  // Subscribe to presence events  
  useGatewayEvent<{ entries: typeof presence }>('presence', (payload) => {
    if (payload?.entries) {
      setPresence(payload.entries)
    }
  })

  return {
    connectionState,
    health,
    presence,
    isConnected: connectionState === 'connected',
    isHealthy: health?.status === 'healthy',
  }
}

/**
 * Hook for agent event streams (tool calls, assistant output, lifecycle)
 */
export function useAgentEvents(
  onToolEvent?: (payload: AgentToolEvent) => void,
  onAssistantEvent?: (payload: AgentAssistantEvent) => void,
  onLifecycleEvent?: (payload: AgentLifecycleEvent) => void
) {
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

/**
 * Hook for real-time session list updates
 */
export function useSessionsRealTime(initialSessions: Session[]) {
  const [sessions, setSessions] = useState(initialSessions)
  const { request } = useGatewayRequest()

  // Update initial sessions when they change
  useEffect(() => {
    setSessions(initialSessions)
  }, [initialSessions])

  // Poll for updates (sessions don't have push events)
  useEffect(() => {
    const interval = setInterval(async () => {
      const result = await request<{ sessions: Session[] }>('sessions.list')
      if (result?.sessions) {
        setSessions(result.sessions)
      }
    }, 30000) // Poll every 30 seconds

    return () => clearInterval(interval)
  }, [request])

  return sessions
}

// Type definitions for agent events
interface AgentEvent {
  stream: 'tool' | 'assistant' | 'lifecycle'
  runId?: string
  sessionKey?: string
}

interface AgentToolEvent extends AgentEvent {
  stream: 'tool'
  event: 'start' | 'update' | 'end'
  toolName: string
  toolId?: string
  input?: unknown
  output?: unknown
  error?: string
  durationMs?: number
}

interface AgentAssistantEvent extends AgentEvent {
  stream: 'assistant'
  delta?: string
  content?: string
}

interface AgentLifecycleEvent extends AgentEvent {
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

interface Session {
  agentId: string
  sessionKey: string
  sessionId: string
  updatedAt: number
  displayName?: string
}

export type { AgentEvent, AgentToolEvent, AgentAssistantEvent, AgentLifecycleEvent }

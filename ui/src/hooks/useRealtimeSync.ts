/**
 * Master Real-Time Sync Hook
 *
 * Wires Gateway WebSocket events to the sessions and metrics Zustand stores.
 * Mount this once near the app root (e.g. in a layout component) to enable
 * live updates across the entire dashboard.
 *
 * Responsibilities:
 *  - Subscribe to session lifecycle events → sessions store
 *  - Subscribe to agent lifecycle events → sessions + metrics stores
 *  - Subscribe to presence events → sessions store (agent online/offline)
 *  - Subscribe to model usage events → metrics store
 *  - Periodic rate recalculation for metrics
 *  - Event deduplication via seq numbers + event IDs
 *
 * Issue: #17 Real-Time Updates
 */

import { useEffect, useRef, useCallback } from 'react'
import { useGatewayEvent } from '@/hooks/useWebSocket'
import { useSessionsStore, type SessionStatus } from '@/store/sessions'
import { useMetricsStore } from '@/store/metrics'
import { useGatewayClient } from '@/store/auth'
import type {
  AgentLifecycleEvent,
  PresenceEntry,
} from '@/lib/websocket'

// ---------------------------------------------------------------------------
//  Event payload types (from Gateway push events)
// ---------------------------------------------------------------------------

/** Session state change event from Gateway */
interface SessionChangeEvent {
  sessionKey: string
  sessionId?: string
  agentId?: string
  status?: string
  displayName?: string
  channel?: string
  activeRunId?: string
  error?: string
  updatedAt?: number
  /** Unique event ID for deduplication */
  eventId?: string
}

/** Session removed/destroyed event */
interface SessionRemovedEvent {
  sessionKey: string
  eventId?: string
}

/** Model usage event from Gateway */
interface ModelUsageEvent {
  model: string
  tokensIn?: number
  tokensOut?: number
  costUsd?: number
  sessionKey?: string
  runId?: string
  eventId?: string
}

/** Message event (inbound/outbound) */
interface MessageEvent {
  direction?: 'inbound' | 'outbound'
  sessionKey?: string
  agentId?: string
  channel?: string
  eventId?: string
}

/** Presence change event */
interface PresenceChangeEvent {
  entries?: PresenceEntry[]
  agentId?: string
  status?: 'online' | 'offline'
}

// ---------------------------------------------------------------------------
//  Rate recalculation interval
// ---------------------------------------------------------------------------

const RATE_RECALC_INTERVAL_MS = 5_000

// ---------------------------------------------------------------------------
//  Hook
// ---------------------------------------------------------------------------

/**
 * Master sync hook — mount once in app root.
 *
 * Subscribes to all relevant Gateway events and pushes updates to
 * the sessions and metrics stores. Handles dedup, rate recalc, and
 * initial session loading.
 *
 * @example
 * function AppShell() {
 *   useRealtimeSync()
 *   return <Dashboard />
 * }
 */
export function useRealtimeSync(): void {
  const { client, isConnected } = useGatewayClient()
  const rateRecalcRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const initialLoadDone = useRef(false)

  // --- Store actions (stable refs via Zustand) ---
  const upsertSession = useSessionsStore((s) => s.upsertSession)
  const removeSession = useSessionsStore((s) => s.removeSession)
  const setSessions = useSessionsStore((s) => s.setSessions)
  const syncAgentsFromPresence = useSessionsStore((s) => s.syncAgentsFromPresence)
  const recordTokens = useMetricsStore((s) => s.recordTokens)
  const recordMessage = useMetricsStore((s) => s.recordMessage)
  const recordModelUsage = useMetricsStore((s) => s.recordModelUsage)
  const recalculateRates = useMetricsStore((s) => s.recalculateRates)
  const isDuplicate = useMetricsStore((s) => s.isDuplicate)

  // -----------------------------------------------------------------------
  //  Initial session load on connect
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!client || !isConnected || initialLoadDone.current) return

    let cancelled = false

    async function loadSessions() {
      try {
        const raw = await client!.getSessions()
        if (cancelled) return

        // Map raw session objects to our Session type
        const sessions = (raw as Array<Record<string, unknown>>).map((s) => ({
          sessionKey: (s.sessionKey as string) ?? '',
          sessionId: (s.sessionId as string) ?? (s.sessionKey as string) ?? '',
          agentId: (s.agentId as string) ?? 'unknown',
          status: mapGatewayStatus(s.status as string | undefined),
          displayName: s.displayName as string | undefined,
          channel: s.channel as string | undefined,
          createdAt: (s.createdAt as number) ?? Date.now(),
          updatedAt: (s.updatedAt as number) ?? Date.now(),
          activeRunId: s.activeRunId as string | undefined,
          tokensIn: s.tokensIn as number | undefined,
          tokensOut: s.tokensOut as number | undefined,
          costUsd: s.costUsd as number | undefined,
        }))

        setSessions(sessions)
        initialLoadDone.current = true
      } catch (err) {
        console.error('[RealtimeSync] Failed to load initial sessions:', err)
      }
    }

    void loadSessions()

    return () => {
      cancelled = true
    }
  }, [client, isConnected, setSessions])

  // Reset initial load flag on disconnect
  useEffect(() => {
    if (!isConnected) {
      initialLoadDone.current = false
    }
  }, [isConnected])

  // -----------------------------------------------------------------------
  //  Event handlers (memoized)
  // -----------------------------------------------------------------------

  const handleSessionChange = useCallback(
    (payload: SessionChangeEvent, seq?: number) => {
      if (!payload.sessionKey) return

      upsertSession(
        payload.sessionKey,
        {
          sessionId: payload.sessionId,
          agentId: payload.agentId,
          status: mapGatewayStatus(payload.status),
          displayName: payload.displayName,
          channel: payload.channel,
          activeRunId: payload.activeRunId,
          lastError: payload.error,
          updatedAt: payload.updatedAt ?? Date.now(),
        },
        seq,
      )
    },
    [upsertSession],
  )

  const handleSessionRemoved = useCallback(
    (payload: SessionRemovedEvent) => {
      if (payload.sessionKey) {
        removeSession(payload.sessionKey)
      }
    },
    [removeSession],
  )

  const handleAgentLifecycle = useCallback(
    (payload: AgentLifecycleEvent, seq?: number) => {
      // Update session status based on lifecycle phase
      if (payload.sessionKey) {
        const statusMap: Record<string, SessionStatus> = {
          start: 'running',
          end: 'idle',
          error: 'error',
        }

        upsertSession(
          payload.sessionKey,
          {
            status: statusMap[payload.phase] ?? 'idle',
            activeRunId: payload.phase === 'start' ? payload.runId : undefined,
            lastError: payload.phase === 'error' ? payload.error : undefined,
          },
          seq,
        )
      }

      // Record token/cost metrics from lifecycle end events
      if (payload.phase === 'end' && payload.summary) {
        const eventId = payload.runId
          ? `lifecycle-end-${payload.runId}`
          : undefined

        if (payload.summary.tokensIn || payload.summary.tokensOut) {
          recordTokens(
            payload.summary.tokensIn ?? 0,
            payload.summary.tokensOut ?? 0,
            eventId ? `${eventId}-tokens` : undefined,
          )
        }
        if (payload.summary.cost) {
          // We don't have model info in lifecycle events, use 'unknown'
          recordModelUsage(
            'unknown',
            payload.summary.tokensIn ?? 0,
            payload.summary.tokensOut ?? 0,
            payload.summary.cost,
            eventId ? `${eventId}-cost` : undefined,
          )
        }
      }
    },
    [upsertSession, recordTokens, recordModelUsage],
  )

  const handlePresence = useCallback(
    (payload: PresenceChangeEvent) => {
      if (payload.entries) {
        // Extract unique agent IDs from presence entries
        const agentIds = payload.entries
          .map((e) => extractAgentId(e))
          .filter((id): id is string => id !== undefined)
        const uniqueIds = [...new Set(agentIds)]

        // Determine which are active (have recent activity)
        const activeIds = payload.entries
          .filter((e) => (e.lastInputSeconds ?? Infinity) < 300)
          .map((e) => extractAgentId(e))
          .filter((id): id is string => id !== undefined)

        syncAgentsFromPresence(uniqueIds, [...new Set(activeIds)])
      }
    },
    [syncAgentsFromPresence],
  )

  const handleModelUsage = useCallback(
    (payload: ModelUsageEvent) => {
      if (isDuplicate(payload.eventId)) return

      if (payload.model) {
        recordModelUsage(
          payload.model,
          payload.tokensIn ?? 0,
          payload.tokensOut ?? 0,
          payload.costUsd ?? 0,
          payload.eventId,
        )
      }
    },
    [recordModelUsage, isDuplicate],
  )

  const handleMessage = useCallback(
    (payload: MessageEvent) => {
      if (isDuplicate(payload.eventId)) return

      const direction = payload.direction ?? 'inbound'
      recordMessage(direction, payload.eventId)
    },
    [recordMessage, isDuplicate],
  )

  // -----------------------------------------------------------------------
  //  Event subscriptions via useGatewayEvent
  // -----------------------------------------------------------------------

  // Session state changes
  useGatewayEvent<SessionChangeEvent>('session', handleSessionChange, [
    handleSessionChange,
  ])

  // Session removal
  useGatewayEvent<SessionRemovedEvent>('session.removed', handleSessionRemoved, [
    handleSessionRemoved,
  ])

  // Agent lifecycle (start/end/error) — already typed
  useGatewayEvent<AgentLifecycleEvent>('agent', (payload, seq) => {
    if (payload?.stream === 'lifecycle') {
      handleAgentLifecycle(payload, seq)
    }
  }, [handleAgentLifecycle])

  // Presence changes
  useGatewayEvent<PresenceChangeEvent>('presence', handlePresence, [
    handlePresence,
  ])

  // Model usage events
  useGatewayEvent<ModelUsageEvent>('model.usage', handleModelUsage, [
    handleModelUsage,
  ])

  // Message events (for rate tracking)
  useGatewayEvent<MessageEvent>('message', handleMessage, [handleMessage])

  // -----------------------------------------------------------------------
  //  Periodic rate recalculation
  // -----------------------------------------------------------------------

  useEffect(() => {
    rateRecalcRef.current = setInterval(() => {
      recalculateRates()
    }, RATE_RECALC_INTERVAL_MS)

    return () => {
      if (rateRecalcRef.current) {
        clearInterval(rateRecalcRef.current)
        rateRecalcRef.current = null
      }
    }
  }, [recalculateRates])
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Map Gateway status strings to our SessionStatus type */
function mapGatewayStatus(status?: string): SessionStatus {
  if (!status) return 'idle'

  const map: Record<string, SessionStatus> = {
    idle: 'idle',
    active: 'running',
    running: 'running',
    busy: 'running',
    error: 'error',
    errored: 'error',
    completed: 'completed',
    done: 'completed',
    aborted: 'aborted',
    cancelled: 'aborted',
  }

  return map[status.toLowerCase()] ?? 'idle'
}

/** Extract an agent ID from a presence entry */
function extractAgentId(entry: PresenceEntry): string | undefined {
  // Presence entries may have host like "agent:kev" or instanceId containing agent info
  const hostMatch = entry.host?.match(/^agent:(\w+)/)
  if (hostMatch) return hostMatch[1]

  const idMatch = entry.instanceId?.match(/agent[:-](\w+)/)
  if (idMatch) return idMatch[1]

  return undefined
}

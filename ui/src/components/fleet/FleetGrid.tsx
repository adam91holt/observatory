/**
 * FleetGrid — Responsive grid of AgentCards with real-time status
 *
 * Fetches agent list & stats via react-query, derives per-agent status
 * from sessions + presence data, and subscribes to WebSocket events
 * for live status updates.
 *
 * Issue: #15 Agent Cards (Fleet Overview Dashboard)
 */

import { useMemo, useCallback, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { getAgents, getSessions, getStats } from "@/api/observatory"
import { useGatewayState, useGatewayEvent } from "@/hooks/useWebSocket"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentCard, type AgentStatus } from "./AgentCard"
import type { Agent, Session } from "@/types"
import type { PresenceEntry } from "@/lib/websocket"

// ---------------------------------------------------------------------------
//  Status derivation
// ---------------------------------------------------------------------------

/** Threshold in ms — sessions updated within this window count as "active" */
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes
const IDLE_THRESHOLD_MS = 30 * 60 * 1000 // 30 minutes

interface AgentPresence {
  status: AgentStatus
  currentActivity?: string
  sessionCount: number
  lastActivity: number | null
  tokens24h: number
}

function deriveAgentPresence(
  agent: Agent,
  sessions: Session[],
  presence: PresenceEntry[],
  byAgent: Record<string, { sessions: number; messages: number; cost: number; tokens: number }>,
): AgentPresence {
  const now = Date.now()

  // Sessions for this agent
  const agentSessions = sessions.filter((s) => s.agentId === agent.id)
  const sessionCount = agentSessions.length

  // Most recent session activity
  const lastUpdated = agentSessions.reduce(
    (max, s) => Math.max(max, s.updatedAt || 0),
    0,
  )
  const lastActivity = lastUpdated > 0 ? lastUpdated : null

  // Token usage from stats (byAgent is "all time" — we use it as best-effort for 24h display)
  const agentStats = byAgent[agent.id]
  const tokens24h = agentStats?.tokens ?? 0

  // Check presence — is this agent's host online?
  const isPresent = presence.some(
    (p) => p.mode === "agent" || p.host === agent.id,
  )

  // Determine status
  let status: AgentStatus = "offline"
  let currentActivity: string | undefined

  if (lastActivity && now - lastActivity < ACTIVE_THRESHOLD_MS) {
    // Very recent activity — busy
    status = "busy"

    // Try to derive activity description from the latest session
    const latestSession = agentSessions.reduce<Session | null>(
      (latest, s) =>
        !latest || s.updatedAt > latest.updatedAt ? s : latest,
      null,
    )
    if (latestSession?.displayName) {
      currentActivity = latestSession.displayName
    }
  } else if (isPresent || (lastActivity && now - lastActivity < IDLE_THRESHOLD_MS)) {
    status = "idle"
  } else if (lastActivity) {
    // Has history but nothing recent
    status = "online"
  }

  // If no sessions at all, and not present, offline
  if (sessionCount === 0 && !isPresent) {
    status = "offline"
  }

  return { status, currentActivity, sessionCount, lastActivity, tokens24h }
}

// ---------------------------------------------------------------------------
//  Skeleton loader
// ---------------------------------------------------------------------------

function AgentCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-6 w-8" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-6 w-12" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-6 w-10" />
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  FleetGrid component
// ---------------------------------------------------------------------------

export function FleetGrid() {
  // Live gateway state (presence, health)
  const { presence } = useGatewayState()

  // Force re-derive on agent lifecycle events
  const [eventBump, setEventBump] = useState(0)
  const bumpHandler = useCallback(() => {
    setEventBump((n) => n + 1)
  }, [])
  useGatewayEvent("agent", bumpHandler)
  useGatewayEvent("presence", bumpHandler)

  // Fetch data
  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
  })

  const { data: sessionsData, isLoading: sessionsLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 10_000, // 10s poll
  })

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["stats"],
    queryFn: getStats,
    refetchInterval: 30_000,
  })

  const agents = agentsData?.agents ?? []
  const sessions = sessionsData?.sessions ?? []
  const byAgent = statsData?.stats?.byAgent ?? {}

  // Derive per-agent data
  const agentCards = useMemo(
    () =>
      agents.map((agent) => ({
        agent,
        ...deriveAgentPresence(agent, sessions, presence, byAgent),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agents, sessions, presence, byAgent, eventBump],
  )

  // Sort: busy first, then online, idle, offline — within each group alphabetical
  const sortedCards = useMemo(() => {
    const order: Record<AgentStatus, number> = {
      busy: 0,
      online: 1,
      idle: 2,
      offline: 3,
    }
    return [...agentCards].sort((a, b) => {
      const statusDiff = order[a.status] - order[b.status]
      if (statusDiff !== 0) return statusDiff
      return a.agent.id.localeCompare(b.agent.id)
    })
  }, [agentCards])

  const isLoading = agentsLoading || sessionsLoading || statsLoading

  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
        {Array.from({ length: 6 }).map((_, i) => (
          <AgentCardSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="text-5xl mb-4">🤖</div>
        <h3 className="text-lg font-semibold text-foreground">No agents configured</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Add agents to your OpenClaw configuration to see them here.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
      {sortedCards.map(({ agent, status, sessionCount, tokens24h, lastActivity, currentActivity }) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          status={status}
          sessionCount={sessionCount}
          tokens24h={tokens24h}
          lastActivity={lastActivity}
          currentActivity={currentActivity}
        />
      ))}
    </div>
  )
}

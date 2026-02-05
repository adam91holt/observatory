/**
 * Sessions Store — Real-time session state management
 *
 * Tracks all agent sessions with live updates from Gateway events.
 * Supports optimistic updates and event deduplication via seq tracking.
 *
 * Issue: #17 Real-Time Updates
 */

import { create } from 'zustand'

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type SessionStatus = 'idle' | 'running' | 'error' | 'completed' | 'aborted'

export type AgentStatus = 'online' | 'offline' | 'busy'

export interface Session {
  sessionKey: string
  sessionId: string
  agentId: string
  status: SessionStatus
  displayName?: string
  channel?: string
  createdAt: number
  updatedAt: number
  /** Current run ID if actively processing */
  activeRunId?: string
  /** Error message if status === 'error' */
  lastError?: string
  /** Token counts for the current/last run */
  tokensIn?: number
  tokensOut?: number
  /** Cost in USD */
  costUsd?: number
}

export interface AgentInfo {
  agentId: string
  status: AgentStatus
  activeSessions: number
  lastSeen: number
}

// ---------------------------------------------------------------------------
//  State shape
// ---------------------------------------------------------------------------

export interface SessionsState {
  /** All known sessions keyed by sessionKey */
  sessions: Map<string, Session>
  /** Agent info aggregated from sessions + presence */
  agents: Map<string, AgentInfo>
  /** Last processed sequence number per event type for dedup */
  lastSeq: number
  /** Last state version for sessions domain */
  stateVersion: number
  /** Whether initial session list has been loaded */
  initialized: boolean
  /** Timestamp of last update */
  lastUpdateAt: number

  // Actions
  /** Bulk-set sessions from initial load or full refresh */
  setSessions: (sessions: Session[]) => void
  /** Update a single session (partial merge) */
  upsertSession: (sessionKey: string, patch: Partial<Session>, seq?: number) => void
  /** Remove a session */
  removeSession: (sessionKey: string) => void
  /** Update agent status from presence events */
  updateAgentStatus: (agentId: string, status: AgentStatus) => void
  /** Batch-update agents from presence list */
  syncAgentsFromPresence: (agentIds: string[], activeAgentIds: string[]) => void
  /** Mark a session as running (optimistic) */
  optimisticStartRun: (sessionKey: string, runId: string) => void
  /** Check if a seq has already been processed (dedup) */
  shouldProcess: (seq?: number) => boolean
  /** Set state version */
  setStateVersion: (version: number) => void
  /** Reset store */
  reset: () => void
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function deriveAgents(sessions: Map<string, Session>): Map<string, AgentInfo> {
  const agents = new Map<string, AgentInfo>()

  for (const session of sessions.values()) {
    const existing = agents.get(session.agentId)
    const isBusy = session.status === 'running'

    if (existing) {
      existing.activeSessions += isBusy ? 1 : 0
      if (isBusy) existing.status = 'busy'
      if (session.updatedAt > existing.lastSeen) {
        existing.lastSeen = session.updatedAt
      }
    } else {
      agents.set(session.agentId, {
        agentId: session.agentId,
        status: isBusy ? 'busy' : 'online',
        activeSessions: isBusy ? 1 : 0,
        lastSeen: session.updatedAt,
      })
    }
  }

  return agents
}

// ---------------------------------------------------------------------------
//  Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  sessions: new Map<string, Session>(),
  agents: new Map<string, AgentInfo>(),
  lastSeq: -1,
  stateVersion: 0,
  initialized: false,
  lastUpdateAt: 0,
}

// ---------------------------------------------------------------------------
//  Store
// ---------------------------------------------------------------------------

export const useSessionsStore = create<SessionsState>((set, get) => ({
  ...INITIAL_STATE,

  setSessions: (sessions) => {
    const map = new Map<string, Session>()
    for (const s of sessions) {
      map.set(s.sessionKey, s)
    }
    set({
      sessions: map,
      agents: deriveAgents(map),
      initialized: true,
      lastUpdateAt: Date.now(),
    })
  },

  upsertSession: (sessionKey, patch, seq) => {
    if (seq !== undefined && !get().shouldProcess(seq)) return

    set((state) => {
      const sessions = new Map(state.sessions)
      const existing = sessions.get(sessionKey)

      const updated: Session = existing
        ? { ...existing, ...patch, updatedAt: patch.updatedAt ?? Date.now() }
        : {
            sessionKey,
            sessionId: patch.sessionId ?? sessionKey,
            agentId: patch.agentId ?? 'unknown',
            status: patch.status ?? 'idle',
            createdAt: patch.createdAt ?? Date.now(),
            updatedAt: patch.updatedAt ?? Date.now(),
            ...patch,
          }

      sessions.set(sessionKey, updated)

      return {
        sessions,
        agents: deriveAgents(sessions),
        lastSeq: seq !== undefined ? Math.max(state.lastSeq, seq) : state.lastSeq,
        lastUpdateAt: Date.now(),
      }
    })
  },

  removeSession: (sessionKey) => {
    set((state) => {
      const sessions = new Map(state.sessions)
      sessions.delete(sessionKey)
      return {
        sessions,
        agents: deriveAgents(sessions),
        lastUpdateAt: Date.now(),
      }
    })
  },

  updateAgentStatus: (agentId, status) => {
    set((state) => {
      const agents = new Map(state.agents)
      const existing = agents.get(agentId)
      if (existing) {
        agents.set(agentId, { ...existing, status, lastSeen: Date.now() })
      } else {
        agents.set(agentId, {
          agentId,
          status,
          activeSessions: 0,
          lastSeen: Date.now(),
        })
      }
      return { agents }
    })
  },

  syncAgentsFromPresence: (agentIds, activeAgentIds) => {
    set((state) => {
      const agents = new Map(state.agents)
      const activeSet = new Set(activeAgentIds)

      // Update known agents
      for (const agentId of agentIds) {
        const existing = agents.get(agentId)
        if (existing) {
          agents.set(agentId, {
            ...existing,
            status: existing.activeSessions > 0 ? 'busy' : 'online',
            lastSeen: Date.now(),
          })
        } else {
          agents.set(agentId, {
            agentId,
            status: activeSet.has(agentId) ? 'busy' : 'online',
            activeSessions: 0,
            lastSeen: Date.now(),
          })
        }
      }

      // Mark agents not in presence as offline
      for (const [id, info] of agents) {
        if (!agentIds.includes(id)) {
          agents.set(id, { ...info, status: 'offline' })
        }
      }

      return { agents }
    })
  },

  optimisticStartRun: (sessionKey, runId) => {
    const session = get().sessions.get(sessionKey)
    if (session) {
      get().upsertSession(sessionKey, {
        status: 'running',
        activeRunId: runId,
      })
    }
  },

  shouldProcess: (seq) => {
    if (seq === undefined) return true
    return seq > get().lastSeq
  },

  setStateVersion: (version) => {
    set({ stateVersion: version })
  },

  reset: () => set(INITIAL_STATE),
}))

// ---------------------------------------------------------------------------
//  Selectors (for fine-grained subscriptions)
// ---------------------------------------------------------------------------

/** Get all sessions as an array, sorted by updatedAt desc */
export function useSessionsList(): Session[] {
  return useSessionsStore((state) =>
    Array.from(state.sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt),
  )
}

/** Get a single session by key */
export function useSession(sessionKey: string): Session | undefined {
  return useSessionsStore((state) => state.sessions.get(sessionKey))
}

/** Get all agents as an array */
export function useAgentsList(): AgentInfo[] {
  return useSessionsStore((state) => Array.from(state.agents.values()))
}

/** Get a single agent's info */
export function useAgentInfo(agentId: string): AgentInfo | undefined {
  return useSessionsStore((state) => state.agents.get(agentId))
}

/** Count sessions by status */
export function useSessionCounts(): Record<SessionStatus, number> {
  return useSessionsStore((state) => {
    const counts: Record<SessionStatus, number> = {
      idle: 0,
      running: 0,
      error: 0,
      completed: 0,
      aborted: 0,
    }
    for (const session of state.sessions.values()) {
      counts[session.status]++
    }
    return counts
  })
}

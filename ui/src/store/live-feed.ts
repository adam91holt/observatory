import { create } from "zustand"

export interface LogEntry {
  id: number
  raw: string
  timestamp: number
  level?: string
  message?: string
  parsed?: Record<string, unknown>
  agentId?: string
  sessionId?: string
  subsystem?: string
  channel?: string
  groupName?: string
  direction?: "inbound" | "outbound"
  // Subagent fields
  runId?: string
  isSubagent?: boolean
  parentSessionKey?: string
  childSessionKey?: string
  task?: string
  label?: string
}

// Sparkline data point (1 per second)
export interface SparklinePoint {
  timestamp: number
  total: number
  errors: number
  warnings: number
  info: number
  subagents: number
}

// Saved filter preset
export interface SavedFilter {
  id: string
  name: string
  levelFilter: string | null
  agentFilter: string | null
  channelFilter: string | null
  textFilter: string
  subagentFilter: boolean | null
}

interface LiveFeedState {
  events: LogEntry[]
  maxEvents: number
  isPaused: boolean
  isConnected: boolean

  isPanelOpen: boolean
  panelHeight: number

  levelFilter: string | null
  agentFilter: string | null
  channelFilter: string | null
  textFilter: string
  expandedIds: number[]

  // New features
  pinnedIds: number[]
  savedFilters: SavedFilter[]
  sparklineData: SparklinePoint[]
  eventsPerSecond: number
  correlatedIds: number[]

  addEvent: (event: LogEntry) => void
  clearEvents: () => void
  togglePause: () => void
  setConnected: (connected: boolean) => void

  togglePanel: () => void
  setPanelHeight: (height: number) => void

  setLevelFilter: (level: string | null) => void
  setAgentFilter: (agent: string | null) => void
  setChannelFilter: (channel: string | null) => void
  setTextFilter: (text: string) => void
  toggleExpanded: (id: number) => void

  // New actions
  togglePinned: (id: number) => void
  saveFilter: (name: string) => void
  deleteFilter: (id: string) => void
  applyFilter: (filter: SavedFilter) => void
  setCorrelatedIds: (ids: number[]) => void
  clearCorrelation: () => void
}

let eventIdCounter = 0
export const getNextEventId = () => ++eventIdCounter

const SPARKLINE_SECONDS = 60
const SAVED_FILTERS_KEY = "observatory-saved-filters"

function loadSavedFilters(): SavedFilter[] {
  try {
    const stored = localStorage.getItem(SAVED_FILTERS_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

function persistSavedFilters(filters: SavedFilter[]) {
  try {
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(filters))
  } catch {
    // ignore
  }
}

// Track events per second
let recentEventTimestamps: number[] = []
function updateEventsPerSecond(): number {
  const now = Date.now()
  const oneSecondAgo = now - 1000
  recentEventTimestamps = recentEventTimestamps.filter(t => t > oneSecondAgo)
  return recentEventTimestamps.length
}

export const useLiveFeedStore = create<LiveFeedState>((set, get) => ({
  events: [],
  maxEvents: 1000,
  isPaused: false,
  isConnected: false,

  isPanelOpen: false,
  panelHeight: 300,

  levelFilter: null,
  agentFilter: null,
  channelFilter: null,
  textFilter: "",
  expandedIds: [],

  // New features
  pinnedIds: [],
  savedFilters: loadSavedFilters(),
  sparklineData: [],
  eventsPerSecond: 0,
  correlatedIds: [],

  addEvent: (event) => {
    if (get().isPaused) return

    const now = Date.now()
    recentEventTimestamps.push(now)
    const eventsPerSecond = updateEventsPerSecond()

    // Update sparkline data
    const currentSecond = Math.floor(now / 1000) * 1000
    const level = event.level?.toLowerCase()
    const isError = level === "error" || level === "fatal"
    const isWarning = level === "warn" || level === "warning"
    const isInfo = level === "info"

    set((state) => {
      // Update or create sparkline point for current second
      let sparklineData = [...state.sparklineData]
      const lastPoint = sparklineData[sparklineData.length - 1]

      if (lastPoint && lastPoint.timestamp === currentSecond) {
        // Update existing point
        sparklineData[sparklineData.length - 1] = {
          ...lastPoint,
          total: lastPoint.total + 1,
          errors: lastPoint.errors + (isError ? 1 : 0),
          warnings: lastPoint.warnings + (isWarning ? 1 : 0),
          info: lastPoint.info + (isInfo ? 1 : 0),
          subagents: lastPoint.subagents + (event.isSubagent ? 1 : 0),
        }
      } else {
        // Create new point
        sparklineData.push({
          timestamp: currentSecond,
          total: 1,
          errors: isError ? 1 : 0,
          warnings: isWarning ? 1 : 0,
          info: isInfo ? 1 : 0,
          subagents: event.isSubagent ? 1 : 0,
        })
        // Keep only last 60 seconds
        if (sparklineData.length > SPARKLINE_SECONDS) {
          sparklineData = sparklineData.slice(-SPARKLINE_SECONDS)
        }
      }

      return {
        events: [event, ...state.events].slice(0, state.maxEvents),
        sparklineData,
        eventsPerSecond,
      }
    })
  },

  clearEvents: () => set({ events: [], sparklineData: [] }),

  togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

  setConnected: (connected) => set({ isConnected: connected }),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  setPanelHeight: (height) => set({ panelHeight: Math.max(150, Math.min(600, height)) }),

  setLevelFilter: (level) => set({ levelFilter: level }),

  setAgentFilter: (agent) => set({ agentFilter: agent }),

  setChannelFilter: (channel) => set({ channelFilter: channel }),

  setTextFilter: (text) => set({ textFilter: text }),

  toggleExpanded: (id) => set((state) => {
    const has = state.expandedIds.includes(id)
    return {
      expandedIds: has
        ? state.expandedIds.filter((x) => x !== id)
        : [...state.expandedIds, id],
    }
  }),

  togglePinned: (id) => set((state) => {
    const has = state.pinnedIds.includes(id)
    return {
      pinnedIds: has
        ? state.pinnedIds.filter((x) => x !== id)
        : [...state.pinnedIds, id],
    }
  }),

  saveFilter: (name) => {
    const state = get()
    const newFilter: SavedFilter = {
      id: crypto.randomUUID(),
      name,
      levelFilter: state.levelFilter,
      agentFilter: state.agentFilter,
      channelFilter: state.channelFilter,
      textFilter: state.textFilter,
      subagentFilter: null, // Will be added when subagentFilter is in main state
    }
    const newFilters = [...state.savedFilters, newFilter]
    persistSavedFilters(newFilters)
    set({ savedFilters: newFilters })
  },

  deleteFilter: (id) => set((state) => {
    const newFilters = state.savedFilters.filter((f) => f.id !== id)
    persistSavedFilters(newFilters)
    return { savedFilters: newFilters }
  }),

  applyFilter: (filter) => set({
    levelFilter: filter.levelFilter,
    agentFilter: filter.agentFilter,
    channelFilter: filter.channelFilter,
    textFilter: filter.textFilter,
  }),

  setCorrelatedIds: (ids) => set({ correlatedIds: ids }),

  clearCorrelation: () => set({ correlatedIds: [] }),
}))

// Check if a session key is a subagent session
function isSubagentSessionKey(key?: string): boolean {
  if (!key) return false
  return key.includes(":subagent:")
}

// Extract agent ID from session key like "agent:kev:subagent:uuid" or "agent:kev:main"
function extractAgentFromSessionKey(key?: string): string | undefined {
  if (!key) return undefined
  const match = key.match(/^agent:([^:]+)/)
  return match?.[1]
}

export function parseLogEvent(data: string): Omit<LogEntry, "id"> {
  let parsed: Record<string, unknown> | undefined
  let level: string | undefined
  let message: string | undefined
  let agentId: string | undefined
  let sessionId: string | undefined
  let subsystem: string | undefined
  let channel: string | undefined
  let groupName: string | undefined
  let direction: "inbound" | "outbound" | undefined
  // Subagent fields
  let runId: string | undefined
  let isSubagent: boolean | undefined
  let parentSessionKey: string | undefined
  let childSessionKey: string | undefined
  let task: string | undefined
  let label: string | undefined

  try {
    parsed = JSON.parse(data)
    if (typeof parsed === "object" && parsed !== null) {
      const meta = parsed._meta as Record<string, unknown> | undefined

      if (meta && typeof parsed["1"] === "string") {
        message = parsed["1"] as string
        level = (meta.logLevelName as string)?.toLowerCase()

        try {
          const subsystemData = JSON.parse(parsed["0"] as string)
          subsystem = subsystemData.subsystem
          if (subsystem) {
            const channelMatch = subsystem.match(/channels\/(\w+)/)
            if (channelMatch) channel = channelMatch[1]
          }
        } catch {}

        if (message) {
          const agentMatch = message.match(/agent[=:](\w+)/i) || message.match(/agentId[=:](\w+)/i)
          if (agentMatch) agentId = agentMatch[1]

          const sessionMatch = message.match(/session[=:]([^\s,]+)/i) || message.match(/sessionId[=:]([^\s,]+)/i)
          if (sessionMatch) sessionId = sessionMatch[1]

          const groupMatch = message.match(/group[=:]([^\s,]+)/i) || message.match(/groupName[=:]"?([^"\s,]+)"?/i)
          if (groupMatch) groupName = groupMatch[1]

          if (message.toLowerCase().includes("incoming") || message.toLowerCase().includes("received")) {
            direction = "inbound"
          } else if (message.toLowerCase().includes("sending") || message.toLowerCase().includes("outgoing") || message.toLowerCase().includes("reply")) {
            direction = "outbound"
          }

          // Extract subagent info from message
          const runIdMatch = message.match(/runId[=:]([^\s,]+)/i)
          if (runIdMatch) runId = runIdMatch[1]

          const childKeyMatch = message.match(/childSessionKey[=:]([^\s,]+)/i)
          if (childKeyMatch) {
            childSessionKey = childKeyMatch[1]
            isSubagent = true
          }

          const requesterMatch = message.match(/requesterSessionKey[=:]([^\s,]+)/i)
          if (requesterMatch) parentSessionKey = requesterMatch[1]

          // Detect spawn/subagent keywords
          if (message.toLowerCase().includes("spawn") || message.toLowerCase().includes("subagent")) {
            isSubagent = true
          }
        }
      } else {
        level = (parsed.level as string) || (parsed.type as string)
        message = (parsed.message as string) || (parsed.msg as string)

        const context = parsed.context as Record<string, unknown> | undefined
        if (context) {
          agentId = context.agentId as string
          sessionId = context.sessionId as string
          channel = context.channel as string
          groupName = context.groupName as string
          // Check for subagent context
          runId = context.runId as string
          childSessionKey = context.childSessionKey as string
          parentSessionKey = context.requesterSessionKey as string || context.parentSessionKey as string
          task = context.task as string
          label = context.label as string
          if (childSessionKey || runId || context.isSubagent) {
            isSubagent = true
          }
        }

        // Check data field for subagent info (lifecycle events)
        const eventData = parsed.data as Record<string, unknown> | undefined
        if (eventData) {
          if (!runId && eventData.runId) runId = eventData.runId as string
          if (!childSessionKey && eventData.childSessionKey) childSessionKey = eventData.childSessionKey as string
          if (!parentSessionKey && eventData.requesterSessionKey) parentSessionKey = eventData.requesterSessionKey as string
          if (!task && eventData.task) task = eventData.task as string
          if (!label && eventData.label) label = eventData.label as string
          const phase = eventData.phase as string
          if (phase === "start" || phase === "end" || phase === "error") {
            isSubagent = true
          }
        }

        // Check stream type for lifecycle
        if (parsed.stream === "lifecycle" || parsed.stream === "tool") {
          if (!runId && typeof parsed.runId === "string") runId = parsed.runId as string
          isSubagent = true
        }
      }

      if (!agentId && message) {
        const agentMatch = message.match(/agent:(\w+)/i)
        if (agentMatch) agentId = agentMatch[1]
      }

      if (!channel && subsystem) {
        const channelMatch = subsystem.match(/channels\/(\w+)/)
        if (channelMatch) channel = channelMatch[1]
      }

      // Extract agentId from session keys if not already set
      if (!agentId) {
        agentId = extractAgentFromSessionKey(childSessionKey) || extractAgentFromSessionKey(parentSessionKey)
      }

      // Check if any session key indicates subagent
      if (isSubagentSessionKey(childSessionKey) || isSubagentSessionKey(sessionId as string)) {
        isSubagent = true
      }
    }
  } catch {
    message = data
  }

  return {
    raw: data,
    timestamp: Date.now(),
    level,
    message,
    parsed,
    agentId,
    sessionId,
    subsystem,
    channel,
    groupName,
    direction,
    runId,
    isSubagent,
    parentSessionKey,
    childSessionKey,
    task,
    label,
  }
}

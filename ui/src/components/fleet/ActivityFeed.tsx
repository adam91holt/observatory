/**
 * ActivityFeed — Real-time activity feed for the Fleet Overview Dashboard
 *
 * Shows a scrollable feed of recent events across all agents:
 * messages sent/received, runs started/completed, errors, and system events.
 * Auto-updates via WebSocket events with pause/resume support.
 *
 * Issue: #18 Activity Feed (Fleet Overview Dashboard)
 */

import { useState, useCallback, useMemo, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { formatDistanceToNow, format } from "date-fns"
import {
  Pause,
  Play,
  Filter,
  MessageCircle,
  Zap,
  AlertTriangle,
  Monitor,
  ArrowDownLeft,
  ArrowUpRight,
  Bot,
  ChevronDown,
  Radio,
  X,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  useGatewayEvent,
  useGatewayState,
  type AgentLifecycleEvent,
  type AgentToolEvent,
} from "@/hooks/useWebSocket"
import { getAgentEmoji, cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type ActivityEventType = "message" | "run" | "error" | "system"

export interface ActivityEvent {
  id: number
  timestamp: number
  agentId: string
  eventType: ActivityEventType
  description: string
  /** Optional detail for navigation */
  sessionKey?: string
  sessionId?: string
  runId?: string
  channel?: string
  direction?: "inbound" | "outbound"
  /** Extra metadata */
  meta?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const MAX_EVENTS = 100

const EVENT_TYPE_CONFIG: Record<
  ActivityEventType,
  { label: string; color: string; bgColor: string; borderColor: string; icon: typeof MessageCircle }
> = {
  message: {
    label: "Message",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    icon: MessageCircle,
  },
  run: {
    label: "Run",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    icon: Zap,
  },
  error: {
    label: "Error",
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    icon: AlertTriangle,
  },
  system: {
    label: "System",
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-500/10",
    borderColor: "border-gray-500/30",
    icon: Monitor,
  },
}

// ---------------------------------------------------------------------------
//  Event ID counter
// ---------------------------------------------------------------------------

let _activityIdCounter = 0
function nextId(): number {
  return ++_activityIdCounter
}

// ---------------------------------------------------------------------------
//  ActivityEventRow
// ---------------------------------------------------------------------------

function ActivityEventRow({
  event,
  onClick,
}: {
  event: ActivityEvent
  onClick: () => void
}) {
  const config = EVENT_TYPE_CONFIG[event.eventType]
  const Icon = config.icon

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left flex items-start gap-3 px-4 py-3",
        "border-b border-border/40 transition-colors",
        "hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/50",
        event.eventType === "error" && "bg-red-500/5",
      )}
    >
      {/* Event type icon */}
      <div
        className={cn(
          "mt-0.5 shrink-0 flex items-center justify-center w-7 h-7 rounded-full",
          config.bgColor,
        )}
      >
        <Icon className={cn("h-3.5 w-3.5", config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Agent */}
          <span className="text-base leading-none" title={event.agentId}>
            {getAgentEmoji(event.agentId)}
          </span>
          <span className="text-sm font-medium truncate">
            {event.agentId}
          </span>

          {/* Event type badge */}
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] px-1.5 py-0 h-4 font-medium",
              config.color,
              config.borderColor,
            )}
          >
            {config.label}
          </Badge>

          {/* Direction indicator for messages */}
          {event.direction && (
            <span className="shrink-0">
              {event.direction === "inbound" ? (
                <ArrowDownLeft className="h-3 w-3 text-green-500" />
              ) : (
                <ArrowUpRight className="h-3 w-3 text-blue-500" />
              )}
            </span>
          )}

          {/* Channel badge */}
          {event.channel && (
            <Badge
              variant="secondary"
              className="text-[10px] px-1.5 py-0 h-4"
            >
              {event.channel}
            </Badge>
          )}
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground truncate">
          {event.description}
        </p>
      </div>

      {/* Timestamp */}
      <div className="shrink-0 text-right">
        <div className="text-[11px] font-mono text-muted-foreground">
          {format(event.timestamp, "HH:mm:ss")}
        </div>
        <div className="text-[10px] text-muted-foreground/60">
          {formatDistanceToNow(event.timestamp, { addSuffix: true })}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
//  Filter bar
// ---------------------------------------------------------------------------

function FilterBar({
  agents,
  selectedAgent,
  onAgentChange,
  selectedType,
  onTypeChange,
  onClear,
  hasFilters,
}: {
  agents: string[]
  selectedAgent: string | null
  onAgentChange: (agent: string | null) => void
  selectedType: ActivityEventType | null
  onTypeChange: (type: ActivityEventType | null) => void
  onClear: () => void
  hasFilters: boolean
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Event type filters */}
      {(Object.keys(EVENT_TYPE_CONFIG) as ActivityEventType[]).map((type) => {
        const config = EVENT_TYPE_CONFIG[type]
        const Icon = config.icon
        return (
          <Button
            key={type}
            variant={selectedType === type ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-7 px-2 text-xs gap-1",
              selectedType === type && config.bgColor,
            )}
            onClick={() => onTypeChange(selectedType === type ? null : type)}
          >
            <Icon className="h-3 w-3" />
            {config.label}
          </Button>
        )
      })}

      {/* Agent filter */}
      {agents.length > 0 && (
        <>
          <div className="w-px h-4 bg-border" />
          {agents.slice(0, 6).map((agent) => (
            <Button
              key={agent}
              variant={selectedAgent === agent ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() =>
                onAgentChange(selectedAgent === agent ? null : agent)
              }
            >
              <span className="text-sm">{getAgentEmoji(agent)}</span>
              {agent}
            </Button>
          ))}
        </>
      )}

      {/* Clear filters */}
      {hasFilters && (
        <>
          <div className="w-px h-4 bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-muted-foreground"
            onClick={onClear}
          >
            <X className="h-3 w-3" />
            Clear
          </Button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  ActivityFeed (main component)
// ---------------------------------------------------------------------------

export function ActivityFeed() {
  const navigate = useNavigate()
  const { isConnected } = useGatewayState()

  // State
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [agentFilter, setAgentFilter] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<ActivityEventType | null>(null)

  // Ref to check pause state inside event callbacks without causing re-subscriptions
  const isPausedRef = useRef(isPaused)
  isPausedRef.current = isPaused

  // -----------------------------------------------------------------------
  //  Add event helper
  // -----------------------------------------------------------------------

  const addEvent = useCallback((evt: Omit<ActivityEvent, "id">) => {
    if (isPausedRef.current) return
    setEvents((prev) => {
      const next = [{ ...evt, id: nextId() }, ...prev]
      return next.length > MAX_EVENTS ? next.slice(0, MAX_EVENTS) : next
    })
  }, [])

  // -----------------------------------------------------------------------
  //  WebSocket event subscriptions
  // -----------------------------------------------------------------------

  // Agent lifecycle events → run started/completed/errored
  useGatewayEvent<AgentLifecycleEvent>("agent", (payload) => {
    if (!payload || payload.stream !== "lifecycle") return

    const agentId = extractAgent(payload.sessionKey) ?? "unknown"

    if (payload.phase === "start") {
      addEvent({
        timestamp: Date.now(),
        agentId,
        eventType: "run",
        description: `Run started${payload.runId ? ` (${payload.runId.slice(0, 8)}…)` : ""}`,
        sessionKey: payload.sessionKey,
        runId: payload.runId,
      })
    } else if (payload.phase === "end") {
      const summary = payload.summary
      const parts: string[] = ["Run completed"]
      if (summary?.durationMs) {
        parts.push(`in ${formatMs(summary.durationMs)}`)
      }
      if (summary?.tokensIn || summary?.tokensOut) {
        parts.push(
          `(${(summary?.tokensIn ?? 0) + (summary?.tokensOut ?? 0)} tokens)`,
        )
      }
      addEvent({
        timestamp: Date.now(),
        agentId,
        eventType: "run",
        description: parts.join(" "),
        sessionKey: payload.sessionKey,
        runId: payload.runId,
      })
    } else if (payload.phase === "error") {
      addEvent({
        timestamp: Date.now(),
        agentId,
        eventType: "error",
        description: payload.error || "Run failed",
        sessionKey: payload.sessionKey,
        runId: payload.runId,
      })
    }
  }, [addEvent])

  // Message events
  interface MessagePayload {
    direction?: "inbound" | "outbound"
    sessionKey?: string
    agentId?: string
    channel?: string
    preview?: string
    groupName?: string
    eventId?: string
  }

  useGatewayEvent<MessagePayload>("message", (payload) => {
    if (!payload) return

    const agentId =
      payload.agentId ?? extractAgent(payload.sessionKey) ?? "unknown"
    const dir = payload.direction ?? "inbound"
    const desc = payload.preview
      ? `${dir === "inbound" ? "Received" : "Sent"}: ${payload.preview}`
      : dir === "inbound"
        ? `Message received${payload.groupName ? ` in ${payload.groupName}` : ""}`
        : `Message sent${payload.groupName ? ` to ${payload.groupName}` : ""}`

    addEvent({
      timestamp: Date.now(),
      agentId,
      eventType: "message",
      description: desc,
      sessionKey: payload.sessionKey,
      channel: payload.channel,
      direction: dir,
    })
  }, [addEvent])

  // Session events (new session, status change)
  interface SessionPayload {
    sessionKey?: string
    agentId?: string
    status?: string
    error?: string
    displayName?: string
    eventId?: string
  }

  useGatewayEvent<SessionPayload>("session", (payload) => {
    if (!payload?.sessionKey) return

    const agentId =
      payload.agentId ?? extractAgent(payload.sessionKey) ?? "unknown"

    if (payload.status === "error" || payload.error) {
      addEvent({
        timestamp: Date.now(),
        agentId,
        eventType: "error",
        description: payload.error || "Session error",
        sessionKey: payload.sessionKey,
      })
    }
  }, [addEvent])

  // Presence events (agent online/offline)
  interface PresencePayload {
    agentId?: string
    status?: string
    entries?: Array<{ host?: string; instanceId?: string }>
  }

  useGatewayEvent<PresencePayload>("presence", (payload) => {
    if (!payload) return

    if (payload.agentId && payload.status) {
      addEvent({
        timestamp: Date.now(),
        agentId: payload.agentId,
        eventType: "system",
        description: `Agent ${payload.status === "online" ? "came online" : "went offline"}`,
      })
    }
  }, [addEvent])

  // Health events
  interface HealthPayload {
    status?: string
    components?: Record<string, { status: string; message?: string }>
  }

  useGatewayEvent<HealthPayload>("health", (payload) => {
    if (!payload) return

    if (payload.status === "degraded" || payload.status === "unhealthy") {
      addEvent({
        timestamp: Date.now(),
        agentId: "system",
        eventType: "system",
        description: `System health: ${payload.status}`,
      })
    }
  }, [addEvent])

  // -----------------------------------------------------------------------
  //  Derived data
  // -----------------------------------------------------------------------

  const agents = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) {
      if (e.agentId && e.agentId !== "system") set.add(e.agentId)
    }
    return Array.from(set).sort()
  }, [events])

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (agentFilter && e.agentId !== agentFilter) return false
      if (typeFilter && e.eventType !== typeFilter) return false
      return true
    })
  }, [events, agentFilter, typeFilter])

  const hasFilters = agentFilter !== null || typeFilter !== null

  // -----------------------------------------------------------------------
  //  Navigation handler
  // -----------------------------------------------------------------------

  const handleEventClick = useCallback(
    (event: ActivityEvent) => {
      // Navigate to the most relevant detail view
      if (event.runId) {
        navigate(`/runs/${event.runId}`)
      } else if (event.sessionKey) {
        const agentId = event.agentId !== "system" ? event.agentId : undefined
        const sessionId = extractSessionId(event.sessionKey)
        if (agentId && sessionId) {
          navigate(`/sessions/${agentId}/${sessionId}`)
        }
      }
    },
    [navigate],
  )

  // -----------------------------------------------------------------------
  //  Auto-scroll to top when new events arrive (if not paused)
  // -----------------------------------------------------------------------

  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isPaused && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [events.length, isPaused])

  // -----------------------------------------------------------------------
  //  Render
  // -----------------------------------------------------------------------

  const eventCounts = useMemo(() => {
    const counts: Record<ActivityEventType, number> = {
      message: 0,
      run: 0,
      error: 0,
      system: 0,
    }
    for (const e of events) {
      counts[e.eventType]++
    }
    return counts
  }, [events])

  return (
    <div className="flex flex-col border rounded-lg bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold">Activity Feed</h3>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              isConnected
                ? "bg-green-500/10 text-green-600 border-green-500/50"
                : "bg-red-500/10 text-red-600 border-red-500/50",
            )}
          >
            <span
              className={cn(
                "mr-1.5 inline-block h-1.5 w-1.5 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500",
              )}
            />
            {isConnected ? "Live" : "Disconnected"}
          </Badge>
          {events.length > 0 && (
            <Badge variant="secondary" className="text-xs font-mono">
              {filteredEvents.length}
              {hasFilters ? `/${events.length}` : ""} events
            </Badge>
          )}

          {/* Mini event type counters */}
          {events.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 ml-1">
              {eventCounts.error > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-red-500 font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  {eventCounts.error}
                </span>
              )}
              {eventCounts.run > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-green-500 font-medium">
                  <Zap className="h-3 w-3" />
                  {eventCounts.run}
                </span>
              )}
              {eventCounts.message > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] text-blue-500 font-medium">
                  <MessageCircle className="h-3 w-3" />
                  {eventCounts.message}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-7 px-2 gap-1", showFilters && "bg-muted")}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-3.5 w-3.5" />
            <span className="text-xs hidden sm:inline">Filter</span>
            {hasFilters && (
              <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
            )}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "h-7 px-2 gap-1",
              isPaused && "bg-orange-500/10 text-orange-600 dark:text-orange-400",
            )}
            onClick={() => setIsPaused(!isPaused)}
            title={isPaused ? "Resume feed" : "Pause feed"}
          >
            {isPaused ? (
              <Play className="h-3.5 w-3.5" />
            ) : (
              <Pause className="h-3.5 w-3.5" />
            )}
            <span className="text-xs hidden sm:inline">
              {isPaused ? "Resume" : "Pause"}
            </span>
          </Button>
        </div>
      </div>

      {/* Filter bar (collapsible) */}
      {showFilters && (
        <div className="px-4 py-2 border-b bg-muted/30">
          <FilterBar
            agents={agents}
            selectedAgent={agentFilter}
            onAgentChange={setAgentFilter}
            selectedType={typeFilter}
            onTypeChange={setTypeFilter}
            onClear={() => {
              setAgentFilter(null)
              setTypeFilter(null)
            }}
            hasFilters={hasFilters}
          />
        </div>
      )}

      {/* Paused banner */}
      {isPaused && (
        <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs font-medium border-b border-orange-500/20">
          <Pause className="h-3 w-3" />
          Feed paused — new events are being buffered
        </div>
      )}

      {/* Events list */}
      <ScrollArea className="h-[420px]" ref={scrollRef}>
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            {events.length === 0 ? (
              <>
                <Radio className="h-8 w-8 mb-3 animate-pulse" />
                <p className="text-sm font-medium">Waiting for events…</p>
                <p className="text-xs mt-1">
                  Activity will appear here as agents work
                </p>
              </>
            ) : (
              <>
                <Filter className="h-8 w-8 mb-3 opacity-50" />
                <p className="text-sm font-medium">No matching events</p>
                <p className="text-xs mt-1">
                  Try adjusting your filters
                </p>
              </>
            )}
          </div>
        ) : (
          filteredEvents.map((event) => (
            <ActivityEventRow
              key={event.id}
              event={event}
              onClick={() => handleEventClick(event)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Extract agent ID from a session key like "agent:kev:whatsapp:..." */
function extractAgent(sessionKey?: string): string | undefined {
  if (!sessionKey) return undefined
  const match = sessionKey.match(/^agent:(\w+)/)
  return match?.[1]
}

/** Extract session ID portion from session key */
function extractSessionId(sessionKey: string): string | undefined {
  // Session keys vary in format; use the full key as the sessionId for navigation
  // The route expects agentId + sessionId; sessionId is typically the full key
  return sessionKey
}

/** Format milliseconds to human-readable */
function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60_000)
  const secs = Math.floor((ms % 60_000) / 1000)
  return `${mins}m ${secs}s`
}

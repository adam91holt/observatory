import { useMemo, useState, useRef, useCallback, Fragment } from "react"
import { useQuery } from "@tanstack/react-query"
import { format, formatDistanceToNow } from "date-fns"
import { useNavigate } from "react-router-dom"
import {
  Play,
  Pause,
  Trash2,
  Download,
  Search,
  ChevronRight,
  Radio,
  MessageCircle,
  Send,
  Bot,
  Smartphone,
  Activity,
  AlertTriangle,
  Zap,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Clock,
  GitBranch,
  CheckCircle,
  XCircle,
  ArrowRight,
  ChevronDown,
  ExternalLink,
  Pin,
  PinOff,
  Save,
  BookmarkCheck,
  Gauge,
  Link2,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useLiveFeedStore, type LogEntry } from "@/store/live-feed"
import { getRuns } from "@/api/observatory"
import { cn, getAgentEmoji } from "@/lib/utils"
import type { SubAgentRun } from "@/types"

const BUCKET_COUNT = 60

// Parse session key to get agent ID
function getAgentFromSessionKey(key: string) {
  const match = key.match(/^agent:([^:]+):/)
  return match ? match[1] : "unknown"
}

function ActiveRunsPanel() {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(true)

  const { data: runsData } = useQuery({
    queryKey: ["runs"],
    queryFn: getRuns,
    refetchInterval: 3000,
  })

  const runs = Object.values(runsData?.runs || {}) as SubAgentRun[]

  // Sort by most recent first, prioritize running ones
  const sortedRuns = [...runs].sort((a, b) => {
    const aRunning = !a.outcome
    const bRunning = !b.outcome
    if (aRunning !== bRunning) return aRunning ? -1 : 1
    const aTime = a.completedAt || a.startedAt || 0
    const bTime = b.completedAt || b.startedAt || 0
    return bTime - aTime
  }).slice(0, 5) // Show max 5

  const runningCount = runs.filter(r => !r.outcome).length

  if (runs.length === 0) return null

  return (
    <Card className="overflow-hidden shrink-0">
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-violet-500" />
          <span className="text-sm font-medium">Subagent Runs</span>
          {runningCount > 0 && (
            <Badge variant="warning" className="text-[10px] px-1.5 py-0">
              {runningCount} running
            </Badge>
          )}
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
            {runs.length} total
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={(e) => {
              e.stopPropagation()
              navigate("/runs")
            }}
          >
            View all
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )} />
        </div>
      </div>
      {isOpen && (
        <div className="border-t divide-y">
          {sortedRuns.map((run) => {
            const requesterAgent = getAgentFromSessionKey(run.requesterSessionKey)
            const childAgent = getAgentFromSessionKey(run.childSessionKey)
            const isRunning = !run.outcome
            const isSuccess = run.outcome?.success

            return (
              <div
                key={run.runId}
                className="px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => navigate(`/runs/${run.runId}`)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Agent flow */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-base" title={requesterAgent}>
                        {getAgentEmoji(requesterAgent)}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-base" title={childAgent}>
                        {getAgentEmoji(childAgent)}
                      </span>
                    </div>

                    {/* Status */}
                    {isRunning ? (
                      <Badge variant="warning" className="shrink-0 text-[10px] px-1.5 py-0 gap-1">
                        <Clock className="h-2.5 w-2.5 animate-pulse" />
                        Running
                      </Badge>
                    ) : isSuccess ? (
                      <Badge variant="success" className="shrink-0 text-[10px] px-1.5 py-0 gap-1">
                        <CheckCircle className="h-2.5 w-2.5" />
                        Done
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="shrink-0 text-[10px] px-1.5 py-0 gap-1">
                        <XCircle className="h-2.5 w-2.5" />
                        Failed
                      </Badge>
                    )}

                    {/* Task */}
                    <span className="text-xs text-muted-foreground truncate">
                      {run.task.length > 60 ? run.task.slice(0, 60) + "..." : run.task}
                    </span>
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {run.completedAt || run.startedAt ? (
                      formatDistanceToNow(new Date(run.completedAt || run.startedAt!), { addSuffix: true })
                    ) : ""}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function extractMessage(event: LogEntry): string {
  if (event.message && !event.message.startsWith("{")) {
    return event.message
  }
  if (event.parsed) {
    const p = event.parsed
    if (p["2"] && typeof p["2"] === "string" && !p["2"].startsWith("{")) return p["2"]
    if (p["1"] && typeof p["1"] === "string" && !p["1"].startsWith("{")) return p["1"]
    if (p.message && typeof p.message === "string") return p.message
    if (p.msg && typeof p.msg === "string") return p.msg
    if (p.text && typeof p.text === "string") {
      const text = p.text as string
      return text.length > 100 ? text.slice(0, 100) + "..." : text
    }
  }
  const raw = event.raw
  return raw.length > 120 ? raw.slice(0, 120) + "..." : raw
}

function getChannelIcon(channel?: string) {
  if (!channel) return null
  const c = channel.toLowerCase()
  if (c === "whatsapp") return <MessageCircle className="h-3.5 w-3.5 text-emerald-500" />
  if (c === "telegram") return <Send className="h-3.5 w-3.5 text-sky-400" />
  if (c === "sms") return <Smartphone className="h-3.5 w-3.5 text-violet-500" />
  return null
}

interface TimelineBucket {
  startTime: number
  endTime: number
  total: number
  errors: number
  warnings: number
  info: number
  debug: number
}

function Timeline({
  events,
  timeRange,
  onTimeRangeChange
}: {
  events: LogEntry[]
  timeRange: [number, number] | null
  onTimeRangeChange: (range: [number, number] | null) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd, setDragEnd] = useState<number | null>(null)

  const buckets = useMemo(() => {
    if (events.length === 0) return []

    const timestamps = events.map(e => e.timestamp)
    const minTime = Math.min(...timestamps)
    const maxTime = Math.max(...timestamps)
    const range = maxTime - minTime || 60000
    const bucketSize = range / BUCKET_COUNT

    const result: TimelineBucket[] = []
    for (let i = 0; i < BUCKET_COUNT; i++) {
      result.push({
        startTime: minTime + i * bucketSize,
        endTime: minTime + (i + 1) * bucketSize,
        total: 0,
        errors: 0,
        warnings: 0,
        info: 0,
        debug: 0,
      })
    }

    for (const event of events) {
      const idx = Math.min(Math.floor((event.timestamp - minTime) / bucketSize), BUCKET_COUNT - 1)
      if (idx >= 0 && idx < BUCKET_COUNT) {
        result[idx].total++
        const level = event.level?.toLowerCase()
        if (level === "error" || level === "fatal") result[idx].errors++
        else if (level === "warn" || level === "warning") result[idx].warnings++
        else if (level === "info") result[idx].info++
        else result[idx].debug++
      }
    }

    return result
  }, [events])

  const maxCount = Math.max(...buckets.map(b => b.total), 1)

  const getPositionFromX = useCallback((clientX: number) => {
    if (!containerRef.current || buckets.length === 0) return null
    const rect = containerRef.current.getBoundingClientRect()
    const x = clientX - rect.left
    const ratio = Math.max(0, Math.min(1, x / rect.width))
    const idx = Math.floor(ratio * BUCKET_COUNT)
    return Math.min(idx, BUCKET_COUNT - 1)
  }, [buckets.length])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const idx = getPositionFromX(e.clientX)
    if (idx !== null) {
      setIsDragging(true)
      setDragStart(idx)
      setDragEnd(idx)
    }
  }, [getPositionFromX])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      const idx = getPositionFromX(e.clientX)
      if (idx !== null) setDragEnd(idx)
    }
  }, [isDragging, getPositionFromX])

  const handleMouseUp = useCallback(() => {
    if (isDragging && dragStart !== null && dragEnd !== null && buckets.length > 0) {
      const start = Math.min(dragStart, dragEnd)
      const end = Math.max(dragStart, dragEnd)
      onTimeRangeChange([buckets[start].startTime, buckets[end].endTime])
    }
    setIsDragging(false)
    setDragStart(null)
    setDragEnd(null)
  }, [isDragging, dragStart, dragEnd, buckets, onTimeRangeChange])

  const handleMouseLeave = useCallback(() => {
    if (isDragging) {
      handleMouseUp()
    }
  }, [isDragging, handleMouseUp])

  const selectionStart = dragStart !== null && dragEnd !== null ? Math.min(dragStart, dragEnd) : null
  const selectionEnd = dragStart !== null && dragEnd !== null ? Math.max(dragStart, dragEnd) : null

  const activeRangeStart = timeRange ? buckets.findIndex(b => b.startTime >= timeRange[0]) : null
  const activeRangeEnd = timeRange ? buckets.findIndex(b => b.endTime >= timeRange[1]) : null

  if (events.length === 0) {
    return (
      <div className="h-16 flex items-center justify-center text-xs text-muted-foreground bg-muted/30 rounded-lg border border-dashed">
        No events to display
      </div>
    )
  }

  const minTime = buckets[0]?.startTime
  const maxTime = buckets[buckets.length - 1]?.endTime

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
        <span>{minTime ? format(minTime, "HH:mm:ss") : ""}</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500" /> Errors</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500" /> Warnings</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-sky-500" /> Info</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-slate-400" /> Debug</span>
        </div>
        <span>{maxTime ? format(maxTime, "HH:mm:ss") : ""}</span>
      </div>

      <div
        ref={containerRef}
        className="h-14 flex items-end gap-px bg-muted/30 rounded-lg p-2 cursor-crosshair select-none relative overflow-hidden"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {buckets.map((bucket, i) => {
          const height = bucket.total > 0 ? Math.max(4, (bucket.total / maxCount) * 100) : 0
          const isInDragSelection = selectionStart !== null && selectionEnd !== null && i >= selectionStart && i <= selectionEnd
          const isInActiveRange = activeRangeStart !== null && activeRangeEnd !== null && i >= activeRangeStart && i <= activeRangeEnd
          const isSelected = isInDragSelection || (timeRange && isInActiveRange)

          return (
            <div
              key={i}
              className={cn(
                "flex-1 flex flex-col justify-end rounded-sm transition-opacity",
                isSelected ? "opacity-100" : timeRange ? "opacity-30" : "opacity-100"
              )}
              style={{ height: '100%' }}
            >
              <div
                className="w-full rounded-sm overflow-hidden flex flex-col justify-end"
                style={{ height: `${height}%` }}
              >
                {bucket.errors > 0 && (
                  <div
                    className="w-full bg-red-500"
                    style={{ height: `${(bucket.errors / bucket.total) * 100}%`, minHeight: bucket.errors > 0 ? 2 : 0 }}
                  />
                )}
                {bucket.warnings > 0 && (
                  <div
                    className="w-full bg-amber-500"
                    style={{ height: `${(bucket.warnings / bucket.total) * 100}%`, minHeight: bucket.warnings > 0 ? 2 : 0 }}
                  />
                )}
                {bucket.info > 0 && (
                  <div
                    className="w-full bg-sky-500"
                    style={{ height: `${(bucket.info / bucket.total) * 100}%`, minHeight: bucket.info > 0 ? 2 : 0 }}
                  />
                )}
                {bucket.debug > 0 && (
                  <div
                    className="w-full bg-slate-400"
                    style={{ height: `${(bucket.debug / bucket.total) * 100}%`, minHeight: bucket.debug > 0 ? 2 : 0 }}
                  />
                )}
              </div>
            </div>
          )
        })}

        {isDragging && selectionStart !== null && selectionEnd !== null && (
          <div
            className="absolute top-0 bottom-0 bg-primary/20 border-x-2 border-primary pointer-events-none"
            style={{
              left: `${(Math.min(selectionStart, selectionEnd) / BUCKET_COUNT) * 100}%`,
              width: `${((Math.abs(selectionEnd - selectionStart) + 1) / BUCKET_COUNT) * 100}%`,
            }}
          />
        )}
      </div>

      {timeRange && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">Selected:</span>
            <span className="font-mono font-medium">
              {format(timeRange[0], "HH:mm:ss")} — {format(timeRange[1], "HH:mm:ss")}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onTimeRangeChange(null)}
            className="h-6 px-2 text-xs"
          >
            Clear selection
          </Button>
        </div>
      )}
    </div>
  )
}

// Mini sparkline component for stats cards
function MiniSparkline({ data, color, height = 20, width = 50 }: {
  data: number[]
  color: string
  height?: number
  width?: number
}) {
  if (data.length < 2) return null

  const max = Math.max(...data, 1)
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (v / max) * height
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
        className={color}
      />
    </svg>
  )
}

// Highlight search matches in text
function HighlightedText({ text, search }: { text: string; search: string }) {
  if (!search || search.length < 2) {
    return <>{text}</>
  }

  const regex = new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  const parts = text.split(regex)

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-yellow-300 dark:bg-yellow-600 text-foreground rounded px-0.5">{part}</mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  )
}

function StatsCard({ icon: Icon, label, value, color, sparklineData }: {
  icon: React.ElementType
  label: string
  value: number
  color: string
  sparklineData?: number[]
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card border">
      <Icon className={cn("h-4 w-4", color)} />
      <div className="flex-1">
        <div className={cn("text-lg font-bold tabular-nums leading-none", value > 0 && color)}>{value}</div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{label}</div>
      </div>
      {sparklineData && sparklineData.length > 1 && (
        <MiniSparkline data={sparklineData} color={color} />
      )}
    </div>
  )
}

function LogRow({ event, isSelected, isPinned, isCorrelated, textFilter, onClick, onPin, onCorrelate }: {
  event: LogEntry
  isSelected: boolean
  isPinned: boolean
  isCorrelated: boolean
  textFilter: string
  onClick: () => void
  onPin: () => void
  onCorrelate: () => void
}) {
  const level = event.level?.toLowerCase()
  const isError = level === "error" || level === "fatal"
  const isWarn = level === "warn" || level === "warning"
  const isInfo = level === "info"
  const message = extractMessage(event)

  const levelColors: Record<string, string> = {
    error: "text-red-500", fatal: "text-red-500",
    warn: "text-amber-500", warning: "text-amber-500",
    info: "text-sky-500", debug: "text-slate-500",
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start font-mono text-[13px] border-b border-border/40 cursor-pointer transition-colors group",
        isError && "bg-red-500/5",
        isWarn && "bg-amber-500/5",
        event.isSubagent && !isError && !isWarn && "bg-violet-500/5",
        isCorrelated && "ring-2 ring-inset ring-cyan-500/50 bg-cyan-500/5",
        isPinned && "border-l-2 border-l-amber-500",
        isSelected ? "bg-muted" : "hover:bg-muted/50"
      )}
    >
      <div className="w-[72px] shrink-0 px-3 py-2 text-muted-foreground text-[11px] tabular-nums">
        {format(event.timestamp, "HH:mm:ss")}
      </div>
      <div className={cn(
        "w-[52px] shrink-0 py-2 text-[11px] font-semibold uppercase",
        levelColors[level || ""] || "text-muted-foreground"
      )}>
        {level?.slice(0, 5) || "LOG"}
      </div>
      <div className="flex-1 py-2 pr-3 min-w-0">
        <div className="flex items-start gap-2">
          {event.isSubagent && (
            <span className="shrink-0 mt-0.5" title="Subagent activity">
              <GitBranch className="h-3.5 w-3.5 text-violet-500" />
            </span>
          )}
          {event.channel && <span className="shrink-0 mt-0.5">{getChannelIcon(event.channel)}</span>}
          {event.agentId && (
            <span className={cn(
              "shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium flex items-center gap-1",
              event.isSubagent ? "bg-violet-500/10 text-violet-500" : "bg-indigo-500/10 text-indigo-500"
            )}>
              <span className="text-xs">{getAgentEmoji(event.agentId)}</span>
              {event.agentId}
            </span>
          )}
          {event.label && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/10 text-fuchsia-500 font-medium">
              {event.label}
            </span>
          )}
          {event.subsystem && !event.channel && !event.isSubagent && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500">
              {event.subsystem}
            </span>
          )}
          <span className={cn(
            "flex-1 break-all",
            isError ? "text-red-600 dark:text-red-400" :
            isWarn ? "text-amber-600 dark:text-amber-400" :
            event.isSubagent ? "text-violet-600 dark:text-violet-400" :
            isInfo ? "text-foreground" : "text-muted-foreground"
          )}>
            <HighlightedText text={message} search={textFilter} />
          </span>
        </div>
      </div>
      <div className="w-16 shrink-0 py-2 flex items-center justify-end gap-1 pr-2">
        {/* Pin button - only show on hover unless already pinned */}
        <button
          onClick={(e) => { e.stopPropagation(); onPin() }}
          className={cn(
            "p-1 rounded transition-colors",
            isPinned
              ? "text-amber-500 hover:text-amber-600"
              : "text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
          )}
          title={isPinned ? "Unpin" : "Pin"}
        >
          {isPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
        </button>
        {/* Correlate button - show if event has sessionId or runId */}
        {(event.sessionId || event.runId) && (
          <button
            onClick={(e) => { e.stopPropagation(); onCorrelate() }}
            className={cn(
              "p-1 rounded transition-colors",
              isCorrelated
                ? "text-cyan-500 hover:text-cyan-600"
                : "text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100"
            )}
            title="Find related events"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronRight className={cn(
          "h-4 w-4 text-muted-foreground/50 transition-transform",
          isSelected && "rotate-90"
        )} />
      </div>
    </div>
  )
}

function DetailPanel({ event, onClose }: { event: LogEntry; onClose: () => void }) {
  return (
    <div className="border-l bg-muted/50 w-[420px] shrink-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm">Event Details</span>
          {event.isSubagent && (
            <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 font-medium">
              <GitBranch className="h-3 w-3" />
              Subagent
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Timestamp</div>
              <div className="font-mono text-xs">{format(event.timestamp, "yyyy-MM-dd HH:mm:ss.SSS")}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Level</div>
              <div className="font-mono text-xs uppercase">{event.level || "—"}</div>
            </div>
            {event.channel && (
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Channel</div>
                <div className="font-mono text-xs capitalize">{event.channel}</div>
              </div>
            )}
            {event.agentId && (
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Agent</div>
                <div className="font-mono text-xs">{event.agentId}</div>
              </div>
            )}
            {event.subsystem && (
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Subsystem</div>
                <div className="font-mono text-xs">{event.subsystem}</div>
              </div>
            )}
            {event.sessionId && (
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Session</div>
                <div className="font-mono text-xs">{event.sessionId}</div>
              </div>
            )}
            {event.direction && (
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Direction</div>
                <div className="font-mono text-xs capitalize">{event.direction}</div>
              </div>
            )}
            {event.groupName && (
              <div>
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Group</div>
                <div className="font-mono text-xs">{event.groupName}</div>
              </div>
            )}
          </div>

          {/* Subagent section */}
          {event.isSubagent && (
            <div className="border rounded-lg p-3 bg-violet-500/5 border-violet-500/20">
              <div className="flex items-center gap-1.5 text-violet-600 dark:text-violet-400 text-xs font-medium mb-2">
                <GitBranch className="h-3.5 w-3.5" />
                Subagent Details
              </div>
              <div className="grid grid-cols-1 gap-2">
                {event.runId && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Run ID</div>
                    <div className="font-mono text-xs break-all">{event.runId}</div>
                  </div>
                )}
                {event.label && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Label</div>
                    <div className="font-mono text-xs">{event.label}</div>
                  </div>
                )}
                {event.task && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Task</div>
                    <div className="font-mono text-xs whitespace-pre-wrap">{event.task}</div>
                  </div>
                )}
                {event.parentSessionKey && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Parent Session</div>
                    <div className="font-mono text-xs break-all">{event.parentSessionKey}</div>
                  </div>
                )}
                {event.childSessionKey && (
                  <div>
                    <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Child Session</div>
                    <div className="font-mono text-xs break-all">{event.childSessionKey}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {event.message && (
            <div>
              <div className="text-[10px] uppercase text-muted-foreground mb-1">Message</div>
              <div className="font-mono text-xs whitespace-pre-wrap break-all bg-muted rounded p-2 border">
                {event.message}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Raw Data</div>
            <pre className="font-mono text-[11px] whitespace-pre-wrap break-all bg-muted rounded p-3 overflow-x-auto border">
              {event.parsed ? JSON.stringify(event.parsed, null, 2) : event.raw}
            </pre>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}

export function LiveFeed() {
  const {
    events,
    isPaused,
    isConnected,
    levelFilter,
    agentFilter,
    channelFilter,
    textFilter,
    pinnedIds,
    savedFilters,
    sparklineData,
    eventsPerSecond,
    correlatedIds,
    togglePause,
    setLevelFilter,
    setAgentFilter,
    setChannelFilter,
    setTextFilter,
    clearEvents,
    togglePinned,
    saveFilter,
    deleteFilter,
    applyFilter,
    setCorrelatedIds,
    clearCorrelation,
  } = useLiveFeedStore()

  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [timeRange, setTimeRange] = useState<[number, number] | null>(null)
  const [subagentFilter, setSubagentFilter] = useState<boolean | null>(null)
  const [filterName, setFilterName] = useState("")

  // Handle log correlation - find all events with same sessionId or runId
  const handleCorrelate = useCallback((event: LogEntry) => {
    if (correlatedIds.includes(event.id)) {
      clearCorrelation()
      return
    }

    const relatedIds: number[] = []
    for (const e of events) {
      if (
        (event.sessionId && e.sessionId === event.sessionId) ||
        (event.runId && e.runId === event.runId) ||
        (event.childSessionKey && e.childSessionKey === event.childSessionKey) ||
        (event.parentSessionKey && e.parentSessionKey === event.parentSessionKey)
      ) {
        relatedIds.push(e.id)
      }
    }
    setCorrelatedIds(relatedIds)
  }, [events, correlatedIds, setCorrelatedIds, clearCorrelation])

  // Compute sparkline data per metric from sparklineData in store
  const sparklines = useMemo(() => {
    const totals = sparklineData.map(p => p.total)
    const errors = sparklineData.map(p => p.errors)
    const warnings = sparklineData.map(p => p.warnings)
    const subagents = sparklineData.map(p => p.subagents)
    return { totals, errors, warnings, subagents }
  }, [sparklineData])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (timeRange && (event.timestamp < timeRange[0] || event.timestamp > timeRange[1])) return false
      if (levelFilter && event.level?.toLowerCase() !== levelFilter) return false
      if (agentFilter && event.agentId !== agentFilter) return false
      if (channelFilter && event.channel !== channelFilter) return false
      if (subagentFilter !== null && Boolean(event.isSubagent) !== subagentFilter) return false
      if (textFilter) {
        const search = textFilter.toLowerCase()
        const matches =
          event.raw.toLowerCase().includes(search) ||
          event.message?.toLowerCase().includes(search) ||
          event.agentId?.toLowerCase().includes(search) ||
          event.channel?.toLowerCase().includes(search) ||
          event.groupName?.toLowerCase().includes(search) ||
          event.label?.toLowerCase().includes(search) ||
          event.task?.toLowerCase().includes(search)
        if (!matches) return false
      }
      return true
    })
  }, [events, levelFilter, agentFilter, channelFilter, textFilter, timeRange, subagentFilter])

  const selectedEvent = selectedId ? events.find(e => e.id === selectedId) : null

  const agents = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) if (e.agentId) set.add(e.agentId)
    return Array.from(set).sort()
  }, [events])

  const channels = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) if (e.channel) set.add(e.channel)
    return Array.from(set).sort()
  }, [events])

  const stats = useMemo(() => {
    let errors = 0, warnings = 0, inbound = 0, outbound = 0, subagents = 0
    for (const e of events) {
      const level = e.level?.toLowerCase()
      if (level === "error" || level === "fatal") errors++
      if (level === "warn" || level === "warning") warnings++
      if (e.direction === "inbound") inbound++
      if (e.direction === "outbound") outbound++
      if (e.isSubagent) subagents++
    }
    return { errors, warnings, inbound, outbound, subagents }
  }, [events])

  const downloadEvents = () => {
    const content = filteredEvents.map((e) => e.raw).join("\n")
    const blob = new Blob([content], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `clawdbot-logs-${format(new Date(), "yyyy-MM-dd-HHmmss")}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasFilters = levelFilter || channelFilter || agentFilter || textFilter || timeRange || subagentFilter !== null

  return (
    <div className="h-full flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Live Feed</h1>
            <div className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
              isConnected
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-red-500/10 text-red-600 dark:text-red-400"
            )}>
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                isConnected ? "bg-emerald-500 animate-pulse" : "bg-red-500"
              )} />
              {isConnected ? "Connected" : "Disconnected"}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">Real-time log stream</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={isPaused ? "default" : "outline"} size="sm" onClick={togglePause} className="gap-1.5">
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {isPaused ? "Resume" : "Pause"}
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={clearEvents}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={downloadEvents}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 shrink-0 flex-wrap">
        <StatsCard icon={Activity} label="Events" value={events.length} color="text-blue-500" sparklineData={sparklines.totals} />
        <StatsCard icon={AlertTriangle} label="Errors" value={stats.errors} color="text-red-500" sparklineData={sparklines.errors} />
        <StatsCard icon={Zap} label="Warnings" value={stats.warnings} color="text-amber-500" sparklineData={sparklines.warnings} />
        <StatsCard icon={GitBranch} label="Subagent" value={stats.subagents} color="text-violet-500" sparklineData={sparklines.subagents} />
        <StatsCard icon={ArrowDownLeft} label="Inbound" value={stats.inbound} color="text-emerald-500" />
        <StatsCard icon={ArrowUpRight} label="Outbound" value={stats.outbound} color="text-sky-500" />
        {/* Events per second metric */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card border">
          <Gauge className="h-4 w-4 text-cyan-500" />
          <div>
            <div className={cn("text-lg font-bold tabular-nums leading-none", eventsPerSecond > 0 && "text-cyan-500")}>{eventsPerSecond}</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Events/sec</div>
          </div>
        </div>
        {/* Pinned count */}
        {pinnedIds.length > 0 && (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card border">
            <Pin className="h-4 w-4 text-amber-500" />
            <div>
              <div className="text-lg font-bold tabular-nums leading-none text-amber-500">{pinnedIds.length}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">Pinned</div>
            </div>
          </div>
        )}
      </div>

      <ActiveRunsPanel />

      <Card className="p-3 shrink-0">
        <Timeline events={events} timeRange={timeRange} onTimeRangeChange={setTimeRange} />
      </Card>

      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex items-center gap-2 p-2 border-b shrink-0 bg-muted/30">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={textFilter}
              onChange={(e) => setTextFilter(e.target.value)}
              className="h-8 pl-8 text-sm bg-background"
            />
          </div>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-1">
            {(["error", "warn", "info", "debug"] as const).map((level) => {
              const colors: Record<string, string> = {
                error: "text-red-500 hover:bg-red-500/10",
                warn: "text-amber-500 hover:bg-amber-500/10",
                info: "text-sky-500 hover:bg-sky-500/10",
                debug: "text-slate-500 hover:bg-slate-500/10",
              }
              return (
                <Button
                  key={level}
                  variant={levelFilter === level ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setLevelFilter(levelFilter === level ? null : level)}
                  className={cn("h-7 px-2 text-xs capitalize", levelFilter !== level && colors[level])}
                >
                  {level}
                </Button>
              )
            })}
          </div>
          <div className="h-5 w-px bg-border" />
          <Button
            variant={subagentFilter === true ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setSubagentFilter(subagentFilter === true ? null : true)}
            className={cn("h-7 px-2 gap-1", subagentFilter !== true && "text-violet-500 hover:bg-violet-500/10")}
          >
            <GitBranch className="h-3 w-3" />
            <span className="text-xs">Subagent</span>
          </Button>
          {channels.length > 0 && (
            <>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-1">
                {channels.map((ch) => (
                  <Button
                    key={ch}
                    variant={channelFilter === ch ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setChannelFilter(channelFilter === ch ? null : ch)}
                    className="h-7 px-2 gap-1"
                  >
                    {getChannelIcon(ch)}
                    <span className="text-xs capitalize">{ch}</span>
                  </Button>
                ))}
              </div>
            </>
          )}
          {agents.length > 0 && (
            <>
              <div className="h-5 w-px bg-border" />
              <div className="flex items-center gap-1">
                {agents.slice(0, 3).map((agent) => (
                  <Button
                    key={agent}
                    variant={agentFilter === agent ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setAgentFilter(agentFilter === agent ? null : agent)}
                    className="h-7 px-2 gap-1"
                  >
                    <Bot className="h-3 w-3" />
                    <span className="text-xs">{agent}</span>
                  </Button>
                ))}
              </div>
            </>
          )}
          {/* Saved Filters */}
          <div className="h-5 w-px bg-border" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 gap-1">
                <BookmarkCheck className="h-3 w-3" />
                <span className="text-xs">Filters</span>
                {savedFilters.length > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">{savedFilters.length}</Badge>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {savedFilters.length === 0 ? (
                <div className="p-2 text-xs text-muted-foreground text-center">No saved filters</div>
              ) : (
                savedFilters.map((filter) => (
                  <DropdownMenuItem
                    key={filter.id}
                    className="flex items-center justify-between"
                    onClick={() => applyFilter(filter)}
                  >
                    <span className="text-sm">{filter.name}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteFilter(filter.id) }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </DropdownMenuItem>
                ))
              )}
              {hasFilters && (
                <>
                  <DropdownMenuSeparator />
                  <div className="p-2">
                    <div className="flex gap-1">
                      <Input
                        placeholder="Filter name..."
                        value={filterName}
                        onChange={(e) => setFilterName(e.target.value)}
                        className="h-7 text-xs"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && filterName.trim()) {
                            saveFilter(filterName.trim())
                            setFilterName("")
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2"
                        disabled={!filterName.trim()}
                        onClick={() => {
                          if (filterName.trim()) {
                            saveFilter(filterName.trim())
                            setFilterName("")
                          }
                        }}
                      >
                        <Save className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Correlation indicator */}
          {correlatedIds.length > 0 && (
            <>
              <div className="h-5 w-px bg-border" />
              <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 border-cyan-500/50 gap-1">
                <Link2 className="h-3 w-3" />
                {correlatedIds.length} correlated
                <button onClick={clearCorrelation} className="ml-1 hover:text-cyan-800">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            </>
          )}

          {hasFilters && (
            <>
              <div className="h-5 w-px bg-border" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setLevelFilter(null)
                  setChannelFilter(null)
                  setAgentFilter(null)
                  setTextFilter("")
                  setTimeRange(null)
                  setSubagentFilter(null)
                  clearCorrelation()
                }}
                className="h-7 px-2 text-xs text-muted-foreground"
              >
                Clear all
              </Button>
            </>
          )}
        </div>

        <div className="flex-1 flex min-h-0">
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground border-b bg-muted/50 shrink-0">
              <div className="w-[72px] px-3 py-1.5">Time</div>
              <div className="w-[52px] py-1.5">Level</div>
              <div className="flex-1 py-1.5">Message</div>
              <div className="w-16 py-1.5 pr-2 text-right">Actions</div>
            </div>
            <ScrollArea className="flex-1">
              {filteredEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className={cn("p-4 rounded-xl mb-4", isPaused ? "bg-amber-500/10" : "bg-muted/50")}>
                    {isPaused ? (
                      <Pause className="h-8 w-8 text-amber-500" />
                    ) : events.length === 0 ? (
                      <Radio className="h-8 w-8 text-muted-foreground animate-pulse" />
                    ) : (
                      <Search className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <p className="font-medium">
                    {isPaused ? "Paused" : events.length === 0 ? "Waiting for events..." : "No matching events"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {isPaused ? "Click Resume to continue" : events.length === 0 ? "Logs will appear here" : "Try different filters"}
                  </p>
                </div>
              ) : (
                filteredEvents.map((event) => (
                  <LogRow
                    key={event.id}
                    event={event}
                    isSelected={selectedId === event.id}
                    isPinned={pinnedIds.includes(event.id)}
                    isCorrelated={correlatedIds.includes(event.id)}
                    textFilter={textFilter}
                    onClick={() => setSelectedId(selectedId === event.id ? null : event.id)}
                    onPin={() => togglePinned(event.id)}
                    onCorrelate={() => handleCorrelate(event)}
                  />
                ))
              )}
            </ScrollArea>
            <div className="px-3 py-1.5 border-t text-[11px] text-muted-foreground bg-muted/30 shrink-0 flex justify-between">
              <span>{filteredEvents.length} of {events.length} events</span>
              {events[0] && <span>Latest: {format(events[0].timestamp, "HH:mm:ss")}</span>}
            </div>
          </div>
          {selectedEvent && (
            <DetailPanel event={selectedEvent} onClose={() => setSelectedId(null)} />
          )}
        </div>
      </Card>
    </div>
  )
}

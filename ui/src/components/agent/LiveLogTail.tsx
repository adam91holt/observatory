/**
 * LiveLogTail — Terminal-style live log viewer for agent detail view
 *
 * Streams agent logs via WebSocket `logs.tail` method and displays them
 * in a console-style monospace view with:
 *  - Color-coded log levels (debug=gray, info=white, warn=yellow, error=red)
 *  - Auto-scroll with "stick to bottom" toggle
 *  - Pause/resume streaming
 *  - Text filter with regex support
 *  - Log level filter (debug/info/warn/error)
 *  - Copy log entry on click
 *  - Clear buffer
 *  - Timestamp display (relative or absolute toggle)
 *  - Circular buffer capped at 2000 lines
 *
 * Issue: #22 Live Log Tail
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { format, formatDistanceToNow } from "date-fns"
import {
  Play,
  Pause,
  Trash2,
  ArrowDownToLine,
  Copy,
  Check,
  Clock,
  Filter,
  Terminal,
  CircleSlash,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useGatewayEvent } from "@/hooks/useWebSocket"
import { useGatewayClient } from "@/store/auth"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogLine {
  id: number
  timestamp: number
  level: LogLevel
  message: string
  raw: string
  source?: string
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const MAX_BUFFER = 2000
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "text-zinc-500",
  info: "text-zinc-200",
  warn: "text-yellow-400",
  error: "text-red-400",
}

const LEVEL_BG_HIGHLIGHT: Record<LogLevel, string> = {
  debug: "",
  info: "",
  warn: "bg-yellow-500/5",
  error: "bg-red-500/5",
}

const LEVEL_BADGE_COLORS: Record<LogLevel, string> = {
  debug: "bg-zinc-700 text-zinc-300",
  info: "bg-zinc-600 text-zinc-200",
  warn: "bg-yellow-900/80 text-yellow-300 border-yellow-700/50",
  error: "bg-red-900/80 text-red-300 border-red-700/50",
}

// ---------------------------------------------------------------------------
//  Log line parser
// ---------------------------------------------------------------------------

let _lineId = 0

function normalizeLevel(raw?: string): LogLevel {
  if (!raw) return "info"
  const l = raw.toLowerCase()
  if (l === "error" || l === "fatal" || l === "err") return "error"
  if (l === "warn" || l === "warning") return "warn"
  if (l === "debug" || l === "trace" || l === "verbose") return "debug"
  return "info"
}

function parseLogPayload(payload: unknown): LogLine | null {
  if (!payload || typeof payload !== "object") return null
  const p = payload as Record<string, unknown>

  let level: LogLevel = "info"
  let message = ""
  let source: string | undefined
  let timestamp = Date.now()

  // Handle structured log formats
  if (typeof p.level === "string") {
    level = normalizeLevel(p.level)
  } else if (typeof p.type === "string") {
    level = normalizeLevel(p.type)
  }

  // Extract from _meta format (the Gateway's native log format)
  const meta = p._meta as Record<string, unknown> | undefined
  if (meta && typeof p["1"] === "string") {
    message = p["1"] as string
    level = normalizeLevel(meta.logLevelName as string)
    try {
      const subsystem = JSON.parse(p["0"] as string)
      source = subsystem?.subsystem
    } catch {
      // ignore
    }
  } else {
    message = (p.message as string) || (p.msg as string) || ""
    const ctx = p.context as Record<string, unknown> | undefined
    if (ctx?.subsystem) source = ctx.subsystem as string
  }

  if (p.timestamp) {
    const ts = typeof p.timestamp === "string" ? new Date(p.timestamp).getTime() : Number(p.timestamp)
    if (!isNaN(ts)) timestamp = ts
  }

  if (!message) {
    try {
      message = JSON.stringify(payload)
    } catch {
      return null
    }
  }

  return {
    id: ++_lineId,
    timestamp,
    level,
    message,
    raw: typeof payload === "string" ? payload : JSON.stringify(payload),
    source,
  }
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

interface LiveLogTailProps {
  agentId: string
  className?: string
}

export function LiveLogTail({ agentId, className }: LiveLogTailProps) {
  // Buffer state
  const [lines, setLines] = useState<LogLine[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [stickToBottom, setStickToBottom] = useState(true)
  const [copiedId, setCopiedId] = useState<number | null>(null)

  // Filter state
  const [textFilter, setTextFilter] = useState("")
  const [levelFilter, setLevelFilter] = useState<LogLevel | null>(null)
  const [useRelativeTime, setUseRelativeTime] = useState(false)
  const [regexError, setRegexError] = useState<string | null>(null)

  // Refs
  const scrollRef = useRef<HTMLDivElement>(null)
  const pausedBufferRef = useRef<LogLine[]>([])
  const isSubscribedRef = useRef(false)

  // WebSocket
  const { client, isConnected } = useGatewayClient()

  // -------------------------------------------------------------------
  //  Subscribe to logs.tail on mount
  // -------------------------------------------------------------------

  useEffect(() => {
    if (!client || !isConnected || isSubscribedRef.current) return

    isSubscribedRef.current = true
    client.tailLogs(true).catch((err) => {
      console.warn("[LiveLogTail] Failed to start log tail:", err)
    })

    return () => {
      isSubscribedRef.current = false
    }
  }, [client, isConnected])

  // -------------------------------------------------------------------
  //  Listen for 'log' events from Gateway
  // -------------------------------------------------------------------

  const handleLogEvent = useCallback(
    (payload: unknown) => {
      const line = parseLogPayload(payload)
      if (!line) return

      // Filter by agent — only show logs mentioning this agent
      const raw = line.raw.toLowerCase()
      const agentLower = agentId.toLowerCase()
      const isAgentLog =
        raw.includes(`agent:${agentLower}`) ||
        raw.includes(`agent=${agentLower}`) ||
        raw.includes(`agentid=${agentLower}`) ||
        raw.includes(`"agentid":"${agentLower}"`) ||
        raw.includes(`"agent":"${agentLower}"`) ||
        (line.source?.toLowerCase().includes(agentLower) ?? false)

      // Be permissive — also show system-level logs
      const isSystemLog =
        !raw.includes("agent:") && !raw.includes("agentid=")
      
      if (!isAgentLog && !isSystemLog) return

      if (isPaused) {
        // Buffer during pause, still respect MAX_BUFFER
        pausedBufferRef.current.push(line)
        if (pausedBufferRef.current.length > MAX_BUFFER) {
          pausedBufferRef.current = pausedBufferRef.current.slice(-MAX_BUFFER)
        }
        return
      }

      setLines((prev) => {
        const next = [...prev, line]
        return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next
      })
    },
    [agentId, isPaused],
  )

  useGatewayEvent("log", handleLogEvent, [handleLogEvent])

  // -------------------------------------------------------------------
  //  Resume: flush buffered lines
  // -------------------------------------------------------------------

  useEffect(() => {
    if (!isPaused && pausedBufferRef.current.length > 0) {
      const buffered = pausedBufferRef.current
      pausedBufferRef.current = []
      setLines((prev) => {
        const next = [...prev, ...buffered]
        return next.length > MAX_BUFFER ? next.slice(-MAX_BUFFER) : next
      })
    }
  }, [isPaused])

  // -------------------------------------------------------------------
  //  Auto-scroll
  // -------------------------------------------------------------------

  useEffect(() => {
    if (stickToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [lines, stickToBottom])

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current
    const atBottom = scrollHeight - scrollTop - clientHeight < 40
    setStickToBottom(atBottom)
  }, [])

  // -------------------------------------------------------------------
  //  Filtering
  // -------------------------------------------------------------------

  const compiledRegex = useMemo(() => {
    if (!textFilter) {
      setRegexError(null)
      return null
    }
    // Check if it looks like a regex (starts/ends with /)
    if (textFilter.startsWith("/")) {
      const lastSlash = textFilter.lastIndexOf("/")
      if (lastSlash > 0) {
        const pattern = textFilter.slice(1, lastSlash)
        const flags = textFilter.slice(lastSlash + 1)
        try {
          const rx = new RegExp(pattern, flags || "i")
          setRegexError(null)
          return rx
        } catch (e) {
          setRegexError((e as Error).message)
          return null
        }
      }
    }
    // Plain text — escape and create case-insensitive regex
    try {
      const escaped = textFilter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const rx = new RegExp(escaped, "i")
      setRegexError(null)
      return rx
    } catch {
      setRegexError("Invalid filter")
      return null
    }
  }, [textFilter])

  const filteredLines = useMemo(() => {
    return lines.filter((line) => {
      // Level filter
      if (levelFilter && line.level !== levelFilter) return false
      // Text/regex filter
      if (compiledRegex && !compiledRegex.test(line.message) && !compiledRegex.test(line.raw)) {
        return false
      }
      return true
    })
  }, [lines, levelFilter, compiledRegex])

  // -------------------------------------------------------------------
  //  Level counts for badges
  // -------------------------------------------------------------------

  const levelCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 }
    for (const l of lines) {
      counts[l.level]++
    }
    return counts
  }, [lines])

  // -------------------------------------------------------------------
  //  Copy handler
  // -------------------------------------------------------------------

  const handleCopy = useCallback(async (line: LogLine) => {
    try {
      await navigator.clipboard.writeText(line.message)
      setCopiedId(line.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // Fallback — select text
    }
  }, [])

  // -------------------------------------------------------------------
  //  Clear
  // -------------------------------------------------------------------

  const handleClear = useCallback(() => {
    setLines([])
    pausedBufferRef.current = []
  }, [])

  // -------------------------------------------------------------------
  //  Format timestamp
  // -------------------------------------------------------------------

  const formatTimestamp = useCallback(
    (ts: number) => {
      if (useRelativeTime) {
        return formatDistanceToNow(new Date(ts), { addSuffix: false, includeSeconds: true })
      }
      return format(new Date(ts), "HH:mm:ss.SSS")
    },
    [useRelativeTime],
  )

  // -------------------------------------------------------------------
  //  Render
  // -------------------------------------------------------------------

  return (
    <div className={cn("flex flex-col h-full bg-zinc-950 rounded-lg border border-zinc-800 overflow-hidden", className)}>
      {/* ---- Toolbar ---- */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-800 bg-zinc-900/80 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Terminal className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">Logs</span>
        </div>

        {/* Connection status */}
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] border",
            isConnected
              ? "bg-emerald-950/50 text-emerald-400 border-emerald-700/50"
              : "bg-red-950/50 text-red-400 border-red-700/50",
          )}
        >
          <span
            className={cn(
              "mr-1 inline-block h-1.5 w-1.5 rounded-full",
              isConnected ? "bg-emerald-400 animate-pulse" : "bg-red-400",
            )}
          />
          {isConnected ? "Streaming" : "Disconnected"}
        </Badge>

        {/* Line count */}
        <Badge variant="outline" className="text-[10px] font-mono bg-zinc-900 text-zinc-400 border-zinc-700">
          {filteredLines.length}{lines.length !== filteredLines.length ? `/${lines.length}` : ""} lines
        </Badge>

        <div className="flex-1" />

        {/* Timestamp toggle */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          onClick={() => setUseRelativeTime(!useRelativeTime)}
          title={useRelativeTime ? "Switch to absolute time" : "Switch to relative time"}
        >
          <Clock className="h-3.5 w-3.5" />
        </Button>

        {/* Stick to bottom */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 hover:bg-zinc-800",
            stickToBottom ? "text-emerald-400" : "text-zinc-500",
          )}
          onClick={() => {
            setStickToBottom(!stickToBottom)
            if (!stickToBottom && scrollRef.current) {
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight
            }
          }}
          title={stickToBottom ? "Auto-scroll ON" : "Auto-scroll OFF"}
        >
          <ArrowDownToLine className="h-3.5 w-3.5" />
        </Button>

        {/* Pause/Resume */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-7 px-2 hover:bg-zinc-800",
            isPaused ? "text-orange-400" : "text-zinc-400 hover:text-zinc-200",
          )}
          onClick={() => setIsPaused(!isPaused)}
          title={isPaused ? `Resume (${pausedBufferRef.current.length} buffered)` : "Pause"}
        >
          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </Button>

        {/* Clear */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
          onClick={handleClear}
          title="Clear"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* ---- Filters ---- */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
        <Filter className="h-3.5 w-3.5 text-zinc-500 shrink-0" />

        {/* Text filter */}
        <div className="relative">
          <Input
            placeholder="Filter text or /regex/i..."
            value={textFilter}
            onChange={(e) => setTextFilter(e.target.value)}
            className={cn(
              "h-7 text-xs w-52 bg-zinc-900 border-zinc-700 text-zinc-200 placeholder:text-zinc-600 font-mono",
              regexError && "border-red-600 focus-visible:ring-red-600",
            )}
          />
          {regexError && (
            <span className="absolute -bottom-4 left-0 text-[9px] text-red-400 whitespace-nowrap">
              {regexError}
            </span>
          )}
        </div>

        {/* Level filters */}
        <div className="flex gap-1">
          {(["error", "warn", "info", "debug"] as LogLevel[]).map((level) => (
            <Button
              key={level}
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 px-2 text-[11px] font-mono uppercase tracking-wide",
                levelFilter === level
                  ? LEVEL_BADGE_COLORS[level]
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800",
              )}
              onClick={() => setLevelFilter(levelFilter === level ? null : level)}
            >
              {level.slice(0, 3)}
              {levelCounts[level] > 0 && (
                <span className="ml-1 text-[9px] opacity-70">{levelCounts[level]}</span>
              )}
            </Button>
          ))}
        </div>
      </div>

      {/* ---- Pause banner ---- */}
      {isPaused && (
        <div className="flex items-center justify-center gap-2 px-3 py-1 bg-orange-950/30 border-b border-orange-800/30 shrink-0">
          <Pause className="h-3 w-3 text-orange-400" />
          <span className="text-xs text-orange-400">
            Paused — {pausedBufferRef.current.length} lines buffered
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 px-2 text-[10px] text-orange-300 hover:text-orange-100 hover:bg-orange-900/30"
            onClick={() => setIsPaused(false)}
          >
            Resume
          </Button>
        </div>
      )}

      {/* ---- Log output ---- */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overflow-x-hidden min-h-0"
        onScroll={handleScroll}
      >
        {filteredLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600">
            {lines.length === 0 ? (
              <>
                <Terminal className="h-8 w-8 mb-3 opacity-50" />
                <span className="text-sm">Waiting for log events...</span>
                <span className="text-xs mt-1 text-zinc-700">
                  Logs for <span className="text-zinc-500 font-mono">{agentId}</span> will appear here
                </span>
              </>
            ) : (
              <>
                <CircleSlash className="h-6 w-6 mb-2 opacity-50" />
                <span className="text-sm">No matching lines</span>
                <span className="text-xs mt-1 text-zinc-700">
                  {lines.length} lines hidden by filters
                </span>
              </>
            )}
          </div>
        ) : (
          <div className="font-mono text-xs leading-relaxed">
            {filteredLines.map((line) => (
              <LogLineRow
                key={line.id}
                line={line}
                formatTimestamp={formatTimestamp}
                onCopy={handleCopy}
                isCopied={copiedId === line.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Log line row (extracted to avoid re-render of entire list)
// ---------------------------------------------------------------------------

interface LogLineRowProps {
  line: LogLine
  formatTimestamp: (ts: number) => string
  onCopy: (line: LogLine) => void
  isCopied: boolean
}

function LogLineRow({ line, formatTimestamp, onCopy, isCopied }: LogLineRowProps) {
  return (
    <div
      className={cn(
        "group flex items-start gap-2 px-3 py-0.5 hover:bg-zinc-800/50 cursor-pointer border-b border-zinc-900/50 transition-colors",
        LEVEL_BG_HIGHLIGHT[line.level],
      )}
      onClick={() => onCopy(line)}
      title="Click to copy"
    >
      {/* Timestamp */}
      <span className="text-zinc-600 shrink-0 w-20 select-none tabular-nums">
        {formatTimestamp(line.timestamp)}
      </span>

      {/* Level badge */}
      <span
        className={cn(
          "shrink-0 w-11 uppercase font-bold text-[10px] select-none",
          LEVEL_COLORS[line.level],
        )}
      >
        {line.level === "error" ? "ERR " : line.level === "warn" ? "WARN" : line.level === "debug" ? "DBG " : "INF "}
      </span>

      {/* Source (if present) */}
      {line.source && (
        <span className="shrink-0 text-zinc-600 max-w-28 truncate text-[10px] select-none">
          [{line.source}]
        </span>
      )}

      {/* Message */}
      <span className={cn("flex-1 break-all whitespace-pre-wrap", LEVEL_COLORS[line.level])}>
        {line.message}
      </span>

      {/* Copy indicator */}
      <span className="shrink-0 w-4 opacity-0 group-hover:opacity-100 transition-opacity select-none">
        {isCopied ? (
          <Check className="h-3 w-3 text-emerald-400" />
        ) : (
          <Copy className="h-3 w-3 text-zinc-600" />
        )}
      </span>
    </div>
  )
}

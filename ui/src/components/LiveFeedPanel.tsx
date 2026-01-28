import { useRef, useCallback, useMemo } from "react"
import { format } from "date-fns"
import {
  Play,
  Pause,
  Trash2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Radio,
  X,
  GripHorizontal,
  MessageCircle,
  Send,
  Smartphone,
  Bot,
  ArrowDownLeft,
  ArrowUpRight,
  Users,
  Hash,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useLiveFeedStore, type LogEntry } from "@/store/live-feed"
import { cn } from "@/lib/utils"

function getLevelColor(level?: string) {
  if (!level) return "text-muted-foreground"
  const l = level.toLowerCase()
  if (l === "error" || l === "fatal") return "text-red-600 dark:text-red-400"
  if (l === "warn" || l === "warning") return "text-yellow-600 dark:text-yellow-400"
  if (l === "info") return "text-blue-600 dark:text-blue-400"
  if (l === "debug") return "text-gray-600 dark:text-gray-400"
  if (l === "system") return "text-purple-600 dark:text-purple-400"
  return "text-muted-foreground"
}

function getLevelBg(level?: string) {
  if (!level) return ""
  const l = level.toLowerCase()
  if (l === "error" || l === "fatal") return "bg-red-500/10"
  if (l === "warn" || l === "warning") return "bg-yellow-500/10"
  return ""
}

function getChannelIcon(channel?: string) {
  if (!channel) return null
  const c = channel.toLowerCase()
  if (c === "whatsapp") return <MessageCircle className="h-3 w-3 text-green-500" />
  if (c === "telegram") return <Send className="h-3 w-3 text-blue-400" />
  if (c === "sms") return <Smartphone className="h-3 w-3 text-purple-500" />
  return <Hash className="h-3 w-3 text-muted-foreground" />
}

function EventRow({ event, isExpanded, onToggle }: {
  event: LogEntry
  isExpanded: boolean
  onToggle: () => void
}) {
  const hasDetails = event.parsed && Object.keys(event.parsed).length > 2
  const isError = event.level?.toLowerCase() === "error" || event.level?.toLowerCase() === "fatal"

  return (
    <div className={cn("border-b border-border/30", getLevelBg(event.level))}>
      <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono">
        <span className="text-muted-foreground shrink-0 w-16">
          {format(event.timestamp, "HH:mm:ss")}
        </span>

        {event.level && (
          <span className={cn("shrink-0 w-10 uppercase font-bold text-[10px]", getLevelColor(event.level))}>
            {event.level.slice(0, 4)}
          </span>
        )}

        {event.direction && (
          <span className="shrink-0">
            {event.direction === "inbound" ? (
              <ArrowDownLeft className="h-3 w-3 text-green-500" />
            ) : (
              <ArrowUpRight className="h-3 w-3 text-blue-500" />
            )}
          </span>
        )}

        {event.channel && (
          <span className="shrink-0 flex items-center gap-0.5">
            {getChannelIcon(event.channel)}
          </span>
        )}

        {event.agentId && (
          <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0 h-4">
            <Bot className="h-2.5 w-2.5 mr-0.5" />
            {event.agentId}
          </Badge>
        )}

        {event.groupName && (
          <Badge variant="secondary" className="shrink-0 text-[10px] px-1 py-0 h-4 max-w-[100px] truncate">
            <Users className="h-2.5 w-2.5 mr-0.5 shrink-0" />
            {event.groupName}
          </Badge>
        )}

        {event.subsystem && !event.channel && (
          <Badge variant="secondary" className="shrink-0 text-[10px] px-1 py-0 h-4">
            {event.subsystem}
          </Badge>
        )}

        <span className={cn("flex-1 truncate", isError && "font-medium")}>
          {event.message || event.raw}
        </span>

        {hasDetails && (
          <button
            onClick={onToggle}
            className="shrink-0 text-muted-foreground hover:text-foreground p-0.5"
          >
            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        )}
      </div>

      {isExpanded && event.parsed && (
        <div className="px-3 py-2 bg-muted/50 text-[10px] font-mono overflow-x-auto">
          <pre>{JSON.stringify(event.parsed, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}

export function LiveFeedPanel() {
  const {
    events,
    isPaused,
    isConnected,
    isPanelOpen,
    panelHeight,
    levelFilter,
    agentFilter,
    channelFilter,
    textFilter,
    expandedIds,
    togglePause,
    togglePanel,
    setPanelHeight,
    setLevelFilter,
    setAgentFilter,
    setChannelFilter,
    setTextFilter,
    toggleExpanded,
    clearEvents,
  } = useLiveFeedStore()

  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null)

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragRef.current = { startY: e.clientY, startHeight: panelHeight }

    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const delta = dragRef.current.startY - e.clientY
      setPanelHeight(dragRef.current.startHeight + delta)
    }

    const handleUp = () => {
      dragRef.current = null
      document.removeEventListener("mousemove", handleMove)
      document.removeEventListener("mouseup", handleUp)
    }

    document.addEventListener("mousemove", handleMove)
    document.addEventListener("mouseup", handleUp)
  }, [panelHeight, setPanelHeight])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (levelFilter && event.level?.toLowerCase() !== levelFilter) return false
      if (agentFilter && event.agentId !== agentFilter) return false
      if (channelFilter && event.channel !== channelFilter) return false
      if (textFilter) {
        const search = textFilter.toLowerCase()
        const matches =
          event.raw.toLowerCase().includes(search) ||
          event.message?.toLowerCase().includes(search) ||
          event.agentId?.toLowerCase().includes(search) ||
          event.channel?.toLowerCase().includes(search) ||
          event.groupName?.toLowerCase().includes(search)
        if (!matches) return false
      }
      return true
    })
  }, [events, levelFilter, agentFilter, channelFilter, textFilter])

  const agents = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) {
      if (e.agentId) set.add(e.agentId)
    }
    return Array.from(set).sort()
  }, [events])

  const channels = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) {
      if (e.channel) set.add(e.channel)
    }
    return Array.from(set).sort()
  }, [events])

  const levelCounts = useMemo(() => {
    return events.reduce((acc, e) => {
      const level = e.level?.toLowerCase() || "other"
      acc[level] = (acc[level] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }, [events])

  if (!isPanelOpen) {
    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={togglePanel}
      >
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Live Feed</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                isConnected
                  ? "bg-green-500/10 text-green-600 border-green-500/50"
                  : "bg-red-500/10 text-red-600 border-red-500/50"
              )}
            >
              <span className={cn(
                "mr-1 inline-block h-1.5 w-1.5 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              )} />
              {isConnected ? "Live" : "Disconnected"}
            </Badge>
          </div>
          <Badge variant="secondary" className="font-mono text-xs">
            {events.length} events
          </Badge>
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t shadow-lg flex flex-col"
      style={{ height: panelHeight }}
    >
      <div
        className="h-2 cursor-ns-resize flex items-center justify-center hover:bg-muted/50 shrink-0"
        onMouseDown={handleDragStart}
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground" />
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Live Feed</span>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              isConnected
                ? "bg-green-500/10 text-green-600 border-green-500/50"
                : "bg-red-500/10 text-red-600 border-red-500/50"
            )}
          >
            <span className={cn(
              "mr-1 inline-block h-1.5 w-1.5 rounded-full",
              isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
            )} />
            {isConnected ? "Live" : "Off"}
          </Badge>
          <Badge variant="secondary" className="font-mono text-xs">
            {filteredEvents.length}/{events.length}
          </Badge>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={togglePause}>
            {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={clearEvents}>
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="sm" className="h-6 px-2" onClick={togglePanel}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 border-b overflow-x-auto shrink-0">
        <Input
          placeholder="Filter..."
          value={textFilter}
          onChange={(e) => setTextFilter(e.target.value)}
          className="h-6 text-xs w-40"
        />

        <div className="flex gap-1">
          {["error", "warn", "info", "debug"].map((level) => (
            <Button
              key={level}
              variant={levelFilter === level ? "default" : "ghost"}
              size="sm"
              className="h-6 px-2 text-xs capitalize"
              onClick={() => setLevelFilter(levelFilter === level ? null : level)}
            >
              {level.slice(0, 3)}
              {levelCounts[level] ? ` (${levelCounts[level]})` : ""}
            </Button>
          ))}
        </div>

        {channels.length > 0 && (
          <>
            <div className="w-px h-4 bg-border" />
            <div className="flex gap-1">
              {channels.map((channel) => (
                <Button
                  key={channel}
                  variant={channelFilter === channel ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setChannelFilter(channelFilter === channel ? null : channel)}
                >
                  {getChannelIcon(channel)}
                </Button>
              ))}
            </div>
          </>
        )}

        {agents.length > 0 && (
          <>
            <div className="w-px h-4 bg-border" />
            <div className="flex gap-1">
              {agents.slice(0, 5).map((agent) => (
                <Button
                  key={agent}
                  variant={agentFilter === agent ? "default" : "ghost"}
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => setAgentFilter(agentFilter === agent ? null : agent)}
                >
                  <Bot className="h-3 w-3" />
                  {agent}
                </Button>
              ))}
            </div>
          </>
        )}
      </div>

      <ScrollArea className="flex-1">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            {isPaused ? (
              <>
                <Pause className="h-6 w-6 mb-2 text-orange-500" />
                <span className="text-sm">Paused</span>
              </>
            ) : events.length === 0 ? (
              <>
                <Radio className="h-6 w-6 mb-2 animate-pulse" />
                <span className="text-sm">Waiting for events...</span>
              </>
            ) : (
              <span className="text-sm">No matching events</span>
            )}
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              isExpanded={expandedIds.includes(event.id)}
              onToggle={() => toggleExpanded(event.id)}
            />
          ))
        )}
      </ScrollArea>
    </div>
  )
}

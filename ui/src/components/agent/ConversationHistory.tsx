/**
 * ConversationHistory — Scrollable conversation view
 *
 * Full chat history for an agent session:
 * - Chat bubble format (user vs assistant)
 * - Auto-scroll to bottom on new messages
 * - Search/filter within conversation
 * - Session selector dropdown
 * - Live updates via polling + WebSocket events
 *
 * Issue: #19 Conversation History
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Search,
  X,
  ArrowDown,
  MessagesSquare,
  ChevronDown,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { getTranscript } from "@/api/observatory"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { AgentMessageBubble } from "./MessageBubble"
import { useAgentEvents } from "@/hooks/useWebSocket"
import type { Message, MessageContent } from "@/types"
import type { Session } from "@/store/sessions"

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface ConversationHistoryProps {
  agentId: string
  sessionId: string
  /** List of available sessions for the session selector */
  sessions?: Session[]
  /** Called when user picks a different session */
  onSessionChange?: (sessionKey: string) => void
  className?: string
}

/** Normalised message after transcript transform */
interface NormalisedMessage extends Message {
  /** Tool result details when role=tool */
  details?: { durationMs?: number; exitCode?: number }
  isError?: boolean
}

// ---------------------------------------------------------------------------
//  Transform helpers (match SessionDetail pattern)
// ---------------------------------------------------------------------------

function transformTranscriptEntries(entries: any[]): NormalisedMessage[] {
  return entries
    .filter((entry: any) => entry.type === "message" && entry.message)
    .map((entry: any) => {
      const msg = entry.message

      // Handle toolResult role → tool role
      if (msg.role === "toolResult") {
        const resultContent = Array.isArray(msg.content)
          ? msg.content.map((c: any) => c.text).join("\n")
          : msg.content
        return {
          role: "tool" as const,
          name: msg.toolName,
          tool_call_id: msg.toolCallId,
          content: resultContent,
          details: msg.details,
          isError: msg.isError,
          timestamp: entry.timestamp,
        }
      }

      // Transform content types: toolCall → tool_use
      let content = msg.content
      if (Array.isArray(content)) {
        content = content.map((c: any) => {
          if (c.type === "toolCall") {
            return { ...c, type: "tool_use", input: c.arguments }
          }
          return c
        })
      }

      // Transform usage format
      const usage = msg.usage
        ? {
            input_tokens: msg.usage.input || 0,
            output_tokens: msg.usage.output || 0,
            cache_creation_input_tokens: msg.usage.cacheWrite || 0,
            cache_read_input_tokens: msg.usage.cacheRead || 0,
          }
        : undefined

      const cost = msg.usage?.cost?.total || 0

      return {
        ...msg,
        content,
        usage,
        cost,
        timestamp: entry.timestamp,
      } as NormalisedMessage
    })
}

/**
 * Build a map of tool_call_id → result data
 * so we can render results inline within tool_use blocks.
 */
function buildToolResultsMap(
  messages: NormalisedMessage[],
): Map<string, { content: string; isError?: boolean; durationMs?: number }> {
  const map = new Map<
    string,
    { content: string; isError?: boolean; durationMs?: number }
  >()
  for (const msg of messages) {
    if (msg.role === "tool" && msg.tool_call_id) {
      const content =
        typeof msg.content === "string"
          ? msg.content
          : JSON.stringify(msg.content)
      map.set(msg.tool_call_id, {
        content,
        isError: msg.isError,
        durationMs: msg.details?.durationMs,
      })
    }
  }
  return map
}

// ---------------------------------------------------------------------------
//  Session Selector
// ---------------------------------------------------------------------------

function SessionSelector({
  sessions,
  currentSessionId,
  onSelect,
}: {
  sessions: Session[]
  currentSessionId: string
  onSelect: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  const current = sessions.find((s) => s.sessionId === currentSessionId)

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted transition-colors text-sm"
      >
        <span className="font-mono truncate max-w-[200px]">
          {current?.displayName || currentSessionId.slice(0, 20)}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 min-w-[280px] max-h-[300px] overflow-auto rounded-lg border bg-popover shadow-lg">
          {sessions.map((session) => (
            <button
              key={session.sessionKey}
              type="button"
              onClick={() => {
                onSelect(session.sessionKey)
                setOpen(false)
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center justify-between gap-2",
                session.sessionId === currentSessionId &&
                  "bg-primary/10 text-primary",
              )}
            >
              <div className="min-w-0">
                <div className="font-mono text-xs truncate">
                  {session.displayName || session.sessionId}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(session.updatedAt).toLocaleDateString()}{" "}
                  {new Date(session.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              {session.sessionId === currentSessionId && (
                <Badge variant="outline" className="text-[9px] h-4 shrink-0">
                  active
                </Badge>
              )}
            </button>
          ))}
          {sessions.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground text-center">
              No other sessions
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Main Component
// ---------------------------------------------------------------------------

export function ConversationHistory({
  agentId,
  sessionId,
  sessions,
  onSessionChange,
  className,
}: ConversationHistoryProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [showScrollButton, setShowScrollButton] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevMessageCount = useRef(0)

  // ---------- Fetch transcript ---------- //
  const {
    data: transcriptData,
    isLoading,
    isRefetching,
  } = useQuery({
    queryKey: ["agent-transcript", agentId, sessionId],
    queryFn: () => getTranscript(agentId, sessionId),
    enabled: !!agentId && !!sessionId,
    refetchInterval: 15000, // Poll every 15s for updates
  })

  // ---------- Transform messages ---------- //
  const messages = useMemo(() => {
    if (!transcriptData?.messages) return []
    return transformTranscriptEntries(transcriptData.messages)
  }, [transcriptData])

  const toolResultsMap = useMemo(() => buildToolResultsMap(messages), [messages])

  // ---------- Filtered messages ---------- //
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages
    const q = searchQuery.toLowerCase()
    return messages.filter((msg) => {
      const text =
        typeof msg.content === "string"
          ? msg.content
          : Array.isArray(msg.content)
            ? msg.content
                .map((c) =>
                  c.type === "text" ? c.text : c.name || "",
                )
                .join(" ")
            : ""
      return (
        text.toLowerCase().includes(q) ||
        msg.role.toLowerCase().includes(q) ||
        (msg.name && msg.name.toLowerCase().includes(q))
      )
    })
  }, [messages, searchQuery])

  // ---------- Auto-scroll ---------- //
  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "instant",
    })
  }, [])

  // Scroll on new messages
  useEffect(() => {
    if (messages.length > prevMessageCount.current) {
      // Only auto-scroll if user is near the bottom
      const el = scrollRef.current
      if (el) {
        const atBottom =
          el.scrollHeight - el.scrollTop - el.clientHeight < 200
        if (atBottom || prevMessageCount.current === 0) {
          // Use instant scroll on initial load, smooth on updates
          scrollToBottom(prevMessageCount.current > 0)
        }
      }
    }
    prevMessageCount.current = messages.length
  }, [messages.length, scrollToBottom])

  // Track scroll position for "scroll to bottom" button
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200
      setShowScrollButton(!atBottom && messages.length > 5)
    }
    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [messages.length])

  // ---------- Live WebSocket updates ---------- //
  useAgentEvents(
    // onTool — could trigger a refetch
    undefined,
    // onAssistant — new message arriving
    undefined,
    // onLifecycle — session completed etc
    undefined,
  )

  // ---------- Search toggle ---------- //
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false)
        setSearchQuery("")
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [searchOpen])

  // ---------- Determine which messages to hide (tool results rendered inline) ---------- //
  const toolResultIds = useMemo(() => {
    const ids = new Set<string>()
    for (const msg of messages) {
      if (msg.role === "tool" && msg.tool_call_id) {
        // Check if this result is paired with a tool_use in the same conversation
        const hasMatchingToolUse = messages.some(
          (m) =>
            m.role === "assistant" &&
            Array.isArray(m.content) &&
            m.content.some(
              (c) => c.type === "tool_use" && c.id === msg.tool_call_id,
            ),
        )
        if (hasMatchingToolUse) {
          ids.add(msg.tool_call_id)
        }
      }
    }
    return ids
  }, [messages])

  // Messages to render (skip tool results that are shown inline)
  const renderMessages = useMemo(
    () =>
      filteredMessages.filter(
        (msg) =>
          !(
            msg.role === "tool" &&
            msg.tool_call_id &&
            toolResultIds.has(msg.tool_call_id)
          ),
      ),
    [filteredMessages, toolResultIds],
  )

  // ---------- Search match count ---------- //
  const matchCount = searchQuery.trim()
    ? filteredMessages.length
    : null

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* ---- Header bar ---- */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-card/50 shrink-0">
        <div className="flex items-center gap-3">
          <MessagesSquare className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Conversation</span>
          <Badge variant="secondary" className="font-mono text-xs">
            {messages.length} messages
          </Badge>
          {isRefetching && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Session selector */}
          {sessions && sessions.length > 1 && onSessionChange && (
            <SessionSelector
              sessions={sessions}
              currentSessionId={sessionId}
              onSelect={onSessionChange}
            />
          )}

          {/* Search toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchOpen((v) => !v)
              if (searchOpen) setSearchQuery("")
            }}
            className="h-8 w-8 p-0"
            title="Search (⌘F)"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ---- Search bar ---- */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30 shrink-0">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <Input
            autoFocus
            type="text"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-7 text-sm border-none shadow-none focus-visible:ring-0 bg-transparent"
          />
          {matchCount !== null && (
            <Badge variant="outline" className="text-[10px] h-5 shrink-0">
              {matchCount} match{matchCount !== 1 ? "es" : ""}
            </Badge>
          )}
          <button
            type="button"
            onClick={() => {
              setSearchOpen(false)
              setSearchQuery("")
            }}
            className="p-1 rounded hover:bg-muted transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* ---- Messages area ---- */}
      <div className="relative flex-1 min-h-0">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={cn("flex gap-3", i % 2 === 0 && "flex-row-reverse")}>
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <Skeleton className={cn("h-20 rounded-2xl", i % 2 === 0 ? "w-[40%]" : "w-[60%]")} />
              </div>
            ))}
          </div>
        ) : (
          <ScrollArea
            ref={scrollRef}
            className="h-full"
          >
            <div className="p-4 space-y-4">
              {renderMessages.map((message, index) => (
                <AgentMessageBubble
                  key={`${message.role}-${message.timestamp || index}-${index}`}
                  message={message}
                  toolResults={toolResultsMap}
                />
              ))}

              {renderMessages.length === 0 && !searchQuery && (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="p-4 rounded-full bg-muted mb-4">
                    <MessagesSquare className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-lg font-medium text-foreground">
                    No messages yet
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This session hasn&apos;t started
                  </p>
                </div>
              )}

              {renderMessages.length === 0 && searchQuery && (
                <div className="flex flex-col items-center justify-center py-20">
                  <Search className="h-8 w-8 text-muted-foreground mb-4" />
                  <p className="text-sm text-muted-foreground">
                    No messages match &ldquo;{searchQuery}&rdquo;
                  </p>
                </div>
              )}

              {/* Scroll anchor */}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>
        )}

        {/* Scroll-to-bottom FAB */}
        {showScrollButton && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            className="absolute bottom-4 right-4 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors z-10"
            title="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

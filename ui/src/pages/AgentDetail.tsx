/**
 * AgentDetail — Agent detail page with conversation history & session browser
 *
 * Full-page view for a specific agent showing:
 * - Agent identity (name, emoji, model)
 * - Session stats (tokens, cost, duration)
 * - Tabs: Conversation (with session selector) | Sessions (browsable list)
 * - Full conversation history with chat bubbles
 *
 * Route: /agent/:agentId
 *
 * Issues: #19 Conversation History, #21 Session Browser
 */

import { useState, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import {
  ArrowLeft,
  RefreshCw,
  Download,
  Clock,
  Coins,
  Hash,
  Zap,
  ExternalLink,
  Bot,
  List,
  MessagesSquare,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { ConversationHistory } from "@/components/agent/ConversationHistory"
import { SessionBrowser } from "@/components/agent/SessionBrowser"
import { getTranscript, getSessions, getAgents } from "@/api/observatory"
import { getAgentEmoji, formatCost, formatTokens, formatDuration } from "@/lib/utils"
import type { Message } from "@/types"
import type { Session } from "@/store/sessions"

// ---------------------------------------------------------------------------
//  Stats helper
// ---------------------------------------------------------------------------

interface SessionTotals {
  messages: number
  inputTokens: number
  outputTokens: number
  cacheRead: number
  cacheWrite: number
  cost: number
  duration: number
  toolCalls: number
}

function computeTotals(messages: any[]): SessionTotals {
  const filtered = messages
    .filter((entry: any) => entry.type === "message" && entry.message)
    .map((entry: any) => entry.message)

  return filtered.reduce(
    (acc: SessionTotals, msg: any) => {
      if (msg.usage) {
        acc.inputTokens += msg.usage.input || 0
        acc.outputTokens += msg.usage.output || 0
        acc.cacheRead += msg.usage.cacheRead || 0
        acc.cacheWrite += msg.usage.cacheWrite || 0
        if (msg.usage.cost?.total) acc.cost += msg.usage.cost.total
      }
      if (msg.duration) acc.duration += msg.duration

      // Count messages by role
      if (msg.role === "user" || msg.role === "assistant") acc.messages++

      // Count tool calls
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const tools = msg.content.filter(
          (c: any) => c.type === "toolCall" || c.type === "tool_use",
        )
        acc.toolCalls += tools.length
      }

      return acc
    },
    {
      messages: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheRead: 0,
      cacheWrite: 0,
      cost: 0,
      duration: 0,
      toolCalls: 0,
    },
  )
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function AgentDetail() {
  const { agentId } = useParams<{ agentId: string }>()
  const navigate = useNavigate()

  // ---------- Fetch agent info ---------- //
  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
  })

  const agent = agentsData?.agents.find((a) => a.id === agentId)

  // ---------- Fetch all sessions for this agent ---------- //
  const { data: sessionsData } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 30000,
  })

  const agentSessions = useMemo(() => {
    if (!sessionsData?.sessions || !agentId) return []
    return sessionsData.sessions
      .filter((s) => s.agentId === agentId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(
        (s) =>
          ({
            sessionKey: s.sessionKey,
            sessionId: s.sessionId,
            agentId: s.agentId,
            status: "idle" as const,
            displayName: s.displayName,
            createdAt: s.updatedAt,
            updatedAt: s.updatedAt,
          }) satisfies Session,
      )
  }, [sessionsData, agentId])

  // ---------- Active session ---------- //
  const [activeSessionKey, setActiveSessionKey] = useState<string | null>(null)

  // Resolve active session — use explicit selection or latest
  const activeSession = useMemo(() => {
    if (activeSessionKey) {
      return agentSessions.find((s) => s.sessionKey === activeSessionKey)
    }
    return agentSessions[0] // Latest
  }, [agentSessions, activeSessionKey])

  const currentSessionId = activeSession?.sessionId ?? ""

  // ---------- Fetch transcript for stats ---------- //
  const {
    data: transcriptData,
    isLoading: transcriptLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["agent-transcript", agentId, currentSessionId],
    queryFn: () => getTranscript(agentId!, currentSessionId),
    enabled: !!agentId && !!currentSessionId,
    refetchInterval: 15000,
  })

  const totals = useMemo(
    () => computeTotals(transcriptData?.messages ?? []),
    [transcriptData],
  )

  const totalTokens = totals.inputTokens + totals.outputTokens

  // ---------- Export ---------- //
  const downloadTranscript = () => {
    if (!transcriptData) return
    const blob = new Blob([JSON.stringify(transcriptData.messages, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `transcript-${agentId}-${currentSessionId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ---------- Session change handler ---------- //
  const handleSessionChange = (sessionKey: string) => {
    setActiveSessionKey(sessionKey)
  }

  if (!agentId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No agent selected
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{getAgentEmoji(agentId)}</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold capitalize">{agentId}</h1>
                <Badge variant="outline" className="text-xs">
                  Agent
                </Badge>
              </div>
              {agent?.model?.primary && (
                <p className="text-xs text-muted-foreground font-mono mt-0.5">
                  {agent.model.primary}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentSessionId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                navigate(
                  `/sessions/${agentId}/${encodeURIComponent(currentSessionId)}`,
                )
              }
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Full Session
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={downloadTranscript}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* ---- Stats cards ---- */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4 shrink-0">
        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <div>
              <div className="text-xl font-bold">
                {transcriptLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  totals.messages
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">Messages</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <Coins className="h-4 w-4 text-blue-500" />
            <div>
              <div className="text-xl font-bold">
                {transcriptLoading ? (
                  <Skeleton className="h-6 w-16" />
                ) : (
                  formatTokens(totalTokens)
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {!transcriptLoading &&
                  `${formatTokens(totals.inputTokens)}↓ ${formatTokens(totals.outputTokens)}↑`}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <Zap className="h-4 w-4 text-purple-500" />
            <div>
              <div className="text-xl font-bold">
                {transcriptLoading ? (
                  <Skeleton className="h-6 w-8" />
                ) : (
                  totals.toolCalls
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">
                Tool Calls
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-3">
            <div className="text-lg">💰</div>
            <div>
              <div className="text-xl font-bold">
                {transcriptLoading ? (
                  <Skeleton className="h-6 w-14" />
                ) : (
                  formatCost(totals.cost)
                )}
              </div>
              <div className="text-[10px] text-muted-foreground">Cost</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ---- Conversation ---- */}
      <Card className="flex-1 min-h-0 overflow-hidden">
        <ConversationHistory
          agentId={agentId}
          sessionId={currentSessionId}
          sessions={agentSessions}
          onSessionChange={handleSessionChange}
          className="h-full"
        />
      </Card>
    </div>
  )
}

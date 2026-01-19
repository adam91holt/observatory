import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { ArrowLeft, ChevronDown, ChevronRight, Clock, DollarSign, Zap, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { JsonViewer } from "@/components/features/JsonViewer"
import { getTranscript, getRuns } from "@/api/observatory"
import { getAgentEmoji, formatCost, formatTokens, formatDuration } from "@/lib/utils"
import type { Message, SubAgentRun } from "@/types"

interface TraceSpan {
  id: string
  type: "llm_call" | "tool_call" | "delegation" | "message"
  agentId: string
  name: string
  startTime: number
  duration?: number
  cost?: number
  tokens?: number
  status: "success" | "error" | "pending"
  children: TraceSpan[]
  data?: any
  error?: string
}

function buildTraceTree(messages: Message[], runs: SubAgentRun[], agentId: string): TraceSpan[] {
  const spans: TraceSpan[] = []
  let currentTime = messages[0]?.timestamp || Date.now()

  messages.forEach((msg, idx) => {
    const msgTime = msg.timestamp || currentTime + idx * 1000

    if (msg.role === "assistant") {
      const span: TraceSpan = {
        id: `msg-${idx}`,
        type: "message",
        agentId,
        name: "Agent Response",
        startTime: msgTime,
        duration: msg.duration,
        cost: msg.cost,
        tokens: msg.usage ? (msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0) : undefined,
        status: "success",
        children: [],
        data: msg
      }

      // Extract LLM calls
      if (msg.usage) {
        span.children.push({
          id: `llm-${idx}`,
          type: "llm_call",
          agentId,
          name: "LLM Generation",
          startTime: msgTime,
          duration: msg.duration ? msg.duration * 0.8 : undefined,
          cost: msg.cost,
          tokens: (msg.usage.input_tokens || 0) + (msg.usage.output_tokens || 0),
          status: "success",
          children: [],
          data: {
            input_tokens: msg.usage.input_tokens,
            output_tokens: msg.usage.output_tokens,
            cache_read: msg.usage.cache_read_input_tokens,
            cache_creation: msg.usage.cache_creation_input_tokens
          }
        })
      }

      // Extract tool calls
      if (Array.isArray(msg.content)) {
        msg.content.forEach((content, contentIdx) => {
          if (content.type === "tool_use") {
            span.children.push({
              id: `tool-${idx}-${contentIdx}`,
              type: "tool_call",
              agentId,
              name: content.name || "Tool",
              startTime: msgTime,
              duration: msg.duration ? msg.duration * 0.1 : undefined,
              status: "success",
              children: [],
              data: {
                input: content.input
              }
            })
          }
        })
      }

      spans.push(span)
    }
  })

  // Add delegation spans from runs
  runs.forEach((run, idx) => {
    if (run.completedAt && run.startedAt) {
      const duration = run.completedAt - run.startedAt
      spans.push({
        id: `delegation-${idx}`,
        type: "delegation",
        agentId: run.childSessionKey.split(':')[1] || "unknown",
        name: `Delegate: ${run.task}`,
        startTime: run.startedAt,
        duration,
        status: run.outcome?.success ? "success" : "error",
        children: [],
        data: run,
        error: run.outcome?.error
      })
    }
  })

  // Sort by start time
  spans.sort((a, b) => a.startTime - b.startTime)

  return spans
}

function TraceSpanRow({ span, depth = 0, totalDuration }: { span: TraceSpan; depth?: number; totalDuration: number }) {
  const [isOpen, setIsOpen] = useState(depth < 2)

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "llm_call": return "🤖"
      case "tool_call": return "🔧"
      case "delegation": return "🔀"
      default: return "💬"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "llm_call": return "bg-purple-500/10 border-purple-500/20"
      case "tool_call": return "bg-blue-500/10 border-blue-500/20"
      case "delegation": return "bg-orange-500/10 border-orange-500/20"
      default: return "bg-gray-500/10 border-gray-500/20"
    }
  }

  const hasChildren = span.children.length > 0

  // Calculate timing bar width (as percentage of total)
  const widthPercent = totalDuration > 0 && span.duration ? (span.duration / totalDuration) * 100 : 0

  return (
    <div className="space-y-1">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={`flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-all ${getTypeColor(span.type)}`}
          style={{ marginLeft: `${depth * 20}px` }}
        >
          {hasChildren && (
            <CollapsibleTrigger>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          )}
          {!hasChildren && <div className="w-6" />}

          <div className="flex items-center gap-3 flex-1 min-w-0">
            <span className="text-xl flex-shrink-0">{getTypeIcon(span.type)}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{span.name}</span>
                <Badge variant="outline" className="text-xs">
                  {span.agentId}
                </Badge>
                {span.status === "error" && (
                  <AlertCircle className="h-4 w-4 text-red-500" />
                )}
              </div>
              {span.duration && (
                <div className="flex items-center gap-4 mt-1">
                  {/* Timing bar */}
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden max-w-md">
                    <div
                      className={`h-full ${span.status === 'error' ? 'bg-red-500' : span.duration < 1000 ? 'bg-green-500' : span.duration < 3000 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(widthPercent, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(span.duration)}
                    </span>
                    {span.cost && (
                      <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                        <DollarSign className="h-3 w-3" />
                        {formatCost(span.cost)}
                      </span>
                    )}
                    {span.tokens && (
                      <span className="flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        {formatTokens(span.tokens)}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {span.error && (
                <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                  Error: {span.error}
                </div>
              )}
            </div>
          </div>

          {span.data && (
            <div className="max-h-[200px] overflow-auto">
              <JsonViewer data={span.data} />
            </div>
          )}
        </div>

        {hasChildren && (
          <CollapsibleContent>
            <div className="mt-1 space-y-1">
              {span.children.map((child) => (
                <TraceSpanRow key={child.id} span={child} depth={depth + 1} totalDuration={totalDuration} />
              ))}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  )
}

export function Trace() {
  const { agentId, sessionId } = useParams<{
    agentId: string
    sessionId: string
  }>()
  const navigate = useNavigate()

  const { data: transcriptData, isLoading: transcriptLoading } = useQuery({
    queryKey: ["transcript", agentId, sessionId],
    queryFn: () => getTranscript(agentId!, sessionId!),
    enabled: !!agentId && !!sessionId,
  })

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: getRuns,
  })

  const messages = transcriptData?.messages || []
  const allRuns = runsData?.runs ? Object.values(runsData.runs) : []
  
  // Filter runs relevant to this session
  const sessionRuns = allRuns.filter(
    run => run.requesterSessionKey.includes(sessionId || "")
  )

  const traceTree = messages.length > 0 ? buildTraceTree(messages, sessionRuns, agentId || "") : []

  // Calculate totals
  const totalDuration = traceTree.reduce((sum, span) => sum + (span.duration || 0), 0)
  const totalCost = traceTree.reduce((sum, span) => sum + (span.cost || 0), 0)
  const totalTokens = traceTree.reduce((sum, span) => sum + (span.tokens || 0), 0)

  const isLoading = transcriptLoading || runsLoading

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{getAgentEmoji(agentId || "")}</span>
              <h1 className="text-2xl font-bold">Trace Waterfall</h1>
              <Badge variant="outline">{agentId}</Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono mt-1">
              {sessionId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(`/sessions/${agentId}/${sessionId}`)}>
            View Session
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Total Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{formatDuration(totalDuration)}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-green-600 dark:text-green-400 font-mono">
                {formatCost(totalCost)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Total Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{formatTokens(totalTokens)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trace Tree */}
      <Card>
        <CardHeader>
          <CardTitle>Execution Timeline</CardTitle>
          <p className="text-sm text-muted-foreground">
            Waterfall view of all operations in this session
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : traceTree.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="p-4 rounded-full bg-muted mb-4">
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No trace data available</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px]">
              <div className="space-y-2">
                {traceTree.map((span) => (
                  <TraceSpanRow key={span.id} span={span} totalDuration={totalDuration} />
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

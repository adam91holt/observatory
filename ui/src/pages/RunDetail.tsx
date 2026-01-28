import { useParams, useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { format, formatDistanceToNow } from "date-fns"
import { useState } from "react"
import { ArrowLeft, ArrowRight, CheckCircle, XCircle, Clock, GitBranch, ChevronDown, ChevronRight, Wrench } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MarkdownContent } from "@/components/features/MarkdownContent"
import { getRuns, getTranscriptByKey } from "@/api/observatory"
import { getAgentEmoji } from "@/lib/utils"

// Expandable JSON component for tool calls/results
function ExpandableJson({ data, label }: { data: unknown; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const jsonStr = JSON.stringify(data, null, 2)
  const isLarge = jsonStr.length > 200

  return (
    <div className="font-mono text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors mb-1"
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <span>{label}</span>
        {!expanded && isLarge && <span className="text-muted-foreground/60">({jsonStr.length} chars)</span>}
      </button>
      {expanded && (
        <pre className="bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto max-h-[400px] overflow-y-auto">
          {jsonStr}
        </pre>
      )}
      {!expanded && !isLarge && (
        <pre className="bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto">
          {jsonStr}
        </pre>
      )}
    </div>
  )
}

export function RunDetail() {
  const { runId } = useParams<{ runId: string }>()
  const navigate = useNavigate()

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: getRuns,
  })

  const run = runsData?.runs?.[runId || ""]

  // Parse session key to get agent ID
  const getAgentFromSessionKey = (key: string) => {
    const match = key.match(/^agent:([^:]+):/)
    return match ? match[1] : "unknown"
  }

  // Try to load the transcript if it exists (using session key lookup)
  const { data: transcriptData, isLoading: transcriptLoading } = useQuery({
    queryKey: ["transcript", run?.childSessionKey],
    queryFn: () => getTranscriptByKey(run!.childSessionKey),
    enabled: !!run?.childSessionKey,
  })

  if (runsLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!run) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate("/runs")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Runs
        </Button>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Run not found</p>
            <p className="text-xs text-muted-foreground mt-2">
              The run may have been archived or deleted.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const isComplete = !!run.outcome
  const isSuccess = run.outcome?.success
  const requesterAgent = getAgentFromSessionKey(run.requesterSessionKey)
  const childAgent = getAgentFromSessionKey(run.childSessionKey)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/runs")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Runs
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-2xl">{getAgentEmoji(requesterAgent)}</span>
              <span className="font-medium">{requesterAgent}</span>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground" />
            <div className="flex items-center gap-1">
              <span className="text-2xl">{getAgentEmoji(childAgent)}</span>
              <span className="font-medium">{childAgent}</span>
            </div>
          </div>
        </div>

        {isComplete ? (
          isSuccess ? (
            <Badge variant="success" className="text-sm">
              <CheckCircle className="h-4 w-4 mr-1" />
              Success
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-sm">
              <XCircle className="h-4 w-4 mr-1" />
              Failed
            </Badge>
          )
        ) : (
          <Badge variant="warning" className="text-sm">
            <Clock className="h-4 w-4 mr-1" />
            Running
          </Badge>
        )}
      </div>

      {/* Task Input */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <span className="text-xl">{getAgentEmoji(requesterAgent)}</span>
            Task from {requesterAgent}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg bg-muted p-4">
            <MarkdownContent content={run.task} />
          </div>
        </CardContent>
      </Card>

      {/* Result/Error */}
      {run.outcome && (() => {
        // Extract last assistant text from transcript if available
        let lastAssistantText = run.outcome.result || ""
        if (!lastAssistantText && transcriptData?.messages) {
          const assistantMessages = (transcriptData.messages as any[])
            .filter((m) => m.type === "message" && m.message?.role === "assistant")
            .reverse()
          for (const msg of assistantMessages) {
            const content = msg.message?.content
            if (typeof content === "string" && content.trim()) {
              lastAssistantText = content
              break
            } else if (Array.isArray(content)) {
              const textBlocks = content
                .filter((c: any) => c.type === "text" && c.text?.trim())
                .map((c: any) => c.text)
              if (textBlocks.length > 0) {
                lastAssistantText = textBlocks.join("\n\n")
                break
              }
            }
          }
        }

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <span className="text-xl">{getAgentEmoji(childAgent)}</span>
                {run.outcome.error ? "Error" : "Result"} from {childAgent}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {run.outcome.error ? (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-4 text-red-500">
                  {run.outcome.error}
                </div>
              ) : lastAssistantText ? (
                <div className="rounded-lg bg-muted p-4">
                  <MarkdownContent content={lastAssistantText} />
                </div>
              ) : (
                <div className="rounded-lg bg-green-500/10 border border-green-500/20 p-4 text-green-600">
                  Task completed successfully
                </div>
              )}
          </CardContent>
        </Card>
        )
      })()}

      {/* Timing & Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground">Run ID</div>
              <code className="text-sm font-mono">{run.runId}</code>
            </div>
            {run.startedAt && (
              <div>
                <div className="text-sm text-muted-foreground">Started</div>
                <div className="text-sm">
                  {format(new Date(run.startedAt), "PPpp")}
                  <span className="text-muted-foreground ml-2">
                    ({formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })})
                  </span>
                </div>
              </div>
            )}
            {run.completedAt && (
              <div>
                <div className="text-sm text-muted-foreground">Completed</div>
                <div className="text-sm">
                  {format(new Date(run.completedAt), "PPpp")}
                  {run.startedAt && (
                    <span className="text-muted-foreground ml-2">
                      (took {Math.round((run.completedAt - run.startedAt) / 1000)}s)
                    </span>
                  )}
                </div>
              </div>
            )}
            <div>
              <div className="text-sm text-muted-foreground">Child Session</div>
              <code className="text-sm font-mono break-all">{run.childSessionKey}</code>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Requester Session</div>
              <code className="text-sm font-mono break-all">{run.requesterSessionKey}</code>
            </div>
            {run.requesterOrigin && (
              <div>
                <div className="text-sm text-muted-foreground">Origin</div>
                <div className="text-sm">
                  {run.requesterOrigin.channel}
                  {run.requesterOrigin.accountId && ` / ${run.requesterOrigin.accountId}`}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transcript (if available) */}
      {transcriptLoading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32" />
          </CardContent>
        </Card>
      ) : transcriptData?.messages && transcriptData.messages.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Conversation ({transcriptData.messages.filter((m: any) => m.type === "message").length} messages)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-4 pr-4">
                {transcriptData.messages
                  .filter((msg: any) => msg.type === "message" && msg.message)
                  .map((msg: any, i: number) => {
                    const role = msg.message?.role || "unknown"
                    const content = msg.message?.content

                    // Handle toolResult role specially
                    if (role === "toolResult") {
                      const toolName = msg.message?.toolName || "unknown"
                      const toolCallId = msg.message?.toolCallId || ""

                      // Extract result text from content array
                      let resultText = ""
                      if (Array.isArray(content)) {
                        resultText = content
                          .filter((c: any) => c.type === "text")
                          .map((c: any) => c.text)
                          .join("\n")
                      } else if (typeof content === "string") {
                        resultText = content
                      }

                      // Try to parse as JSON
                      let resultData: any = resultText
                      let isJson = false
                      try {
                        resultData = JSON.parse(resultText)
                        isJson = true
                      } catch {}

                      return (
                        <div key={i} className="text-sm">
                          <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 p-3">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle className="h-4 w-4 text-orange-500" />
                              <span className="font-medium text-orange-600">{toolName}</span>
                              <span className="text-xs text-muted-foreground">result</span>
                              {toolCallId && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {toolCallId.slice(0, 12)}...
                                </span>
                              )}
                            </div>
                            {isJson ? (
                              <ExpandableJson data={resultData} label="Result" />
                            ) : (
                              <div className="text-xs font-mono bg-black/5 dark:bg-white/5 rounded p-2 whitespace-pre-wrap max-h-[300px] overflow-auto">
                                {resultText.slice(0, 3000)}
                                {resultText.length > 3000 && "..."}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }

                    // Parse content blocks for other roles
                    const blocks: Array<{ type: string; content: any }> = []

                    if (typeof content === "string") {
                      if (content.trim()) blocks.push({ type: "text", content })
                    } else if (Array.isArray(content)) {
                      for (const c of content) {
                        if (c.type === "text" && c.text?.trim()) {
                          blocks.push({ type: "text", content: c.text })
                        } else if (c.type === "toolCall") {
                          blocks.push({ type: "toolCall", content: c })
                        }
                      }
                    }

                    // Skip empty messages
                    if (blocks.length === 0) return null

                    const roleColors: Record<string, string> = {
                      user: "bg-blue-500/10 border-blue-500/20 text-blue-600",
                      assistant: "bg-green-500/10 border-green-500/20 text-green-600",
                      system: "bg-yellow-500/10 border-yellow-500/20 text-yellow-600",
                    }
                    const roleColor = roleColors[role] || "bg-muted"

                    return (
                      <div key={i} className="text-sm">
                        <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-2 ${roleColor}`}>
                          {role}
                        </div>
                        <div className="space-y-3">
                          {blocks.map((block, j) => {
                            if (block.type === "text") {
                              return (
                                <div key={j} className="rounded-lg bg-muted p-4 border">
                                  <MarkdownContent content={block.content} />
                                </div>
                              )
                            }
                            if (block.type === "toolCall") {
                              return (
                                <div key={j} className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3">
                                  <div className="flex items-center gap-2 mb-2">
                                    <Wrench className="h-4 w-4 text-purple-500" />
                                    <span className="font-medium text-purple-600">{block.content.name}</span>
                                    <span className="text-xs text-muted-foreground">tool call</span>
                                  </div>
                                  <ExpandableJson data={block.content.arguments} label="Arguments" />
                                </div>
                              )
                            }
                            return null
                          })}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <p>Session transcript not available</p>
            <p className="text-xs mt-1">The transcript may have been deleted during cleanup.</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

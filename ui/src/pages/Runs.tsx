import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "react-router-dom"
import { formatDistanceToNow } from "date-fns"
import { GitBranch, CheckCircle, XCircle, Clock, ArrowRight, ExternalLink } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { getRuns } from "@/api/observatory"
import { getAgentEmoji } from "@/lib/utils"

export function Runs() {
  const navigate = useNavigate()
  const { data: runsData, isLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: getRuns,
    refetchInterval: 5000,
  })

  const runs = Object.values(runsData?.runs || {})

  // Sort by most recent first
  const sortedRuns = [...runs].sort((a, b) => {
    const aTime = a.completedAt || a.startedAt || 0
    const bTime = b.completedAt || b.startedAt || 0
    return bTime - aTime
  })

  // Parse session key to get agent ID
  const getAgentFromSessionKey = (key: string) => {
    const match = key.match(/^agent:([^:]+):/)
    return match ? match[1] : "unknown"
  }

  const handleRunClick = (run: any) => {
    navigate(`/runs/${run.runId}`)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Sub-Agent Runs</h1>
        <p className="text-muted-foreground">
          Task delegations between agents
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-2xl font-bold">{runs.length}</div>
              <div className="text-xs text-muted-foreground">Total Runs</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <div className="text-2xl font-bold">
                {runs.filter((r) => r.outcome?.success).length}
              </div>
              <div className="text-xs text-muted-foreground">Successful</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <div className="text-2xl font-bold">
                {runs.filter((r) => r.outcome && !r.outcome.success).length}
              </div>
              <div className="text-xs text-muted-foreground">Failed</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Runs List */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-350px)]">
          <div className="space-y-4">
            {sortedRuns.map((run) => {
              const requesterAgent = getAgentFromSessionKey(run.requesterSessionKey)
              const childAgent = getAgentFromSessionKey(run.childSessionKey)
              const isComplete = !!run.outcome
              const isSuccess = run.outcome?.success

              return (
                <Card
                  key={run.runId}
                  className="cursor-pointer hover:bg-muted/50 transition-colors group"
                  onClick={() => handleRunClick(run)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-4">
                        {/* Agent flow */}
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-xl">
                              {getAgentEmoji(requesterAgent)}
                            </span>
                            <span className="text-sm font-medium">
                              {requesterAgent}
                            </span>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground" />
                          <div className="flex items-center gap-1">
                            <span className="text-xl">
                              {getAgentEmoji(childAgent)}
                            </span>
                            <span className="text-sm font-medium">
                              {childAgent}
                            </span>
                          </div>
                        </div>

                        {/* Status */}
                        {isComplete ? (
                          isSuccess ? (
                            <Badge variant="success">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              Failed
                            </Badge>
                          )
                        ) : (
                          <Badge variant="warning">
                            <Clock className="h-3 w-3 mr-1" />
                            Running
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {run.completedAt ? (
                            formatDistanceToNow(new Date(run.completedAt), {
                              addSuffix: true,
                            })
                          ) : run.startedAt ? (
                            `Started ${formatDistanceToNow(new Date(run.startedAt), {
                              addSuffix: true,
                            })}`
                          ) : (
                            "Unknown time"
                          )}
                        </span>
                        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </div>

                    {/* Task preview */}
                    <div className="text-sm text-muted-foreground line-clamp-2">
                      {run.task}
                    </div>

                    {/* Error indicator */}
                    {run.outcome?.error && (
                      <div className="mt-2 text-xs text-red-500">
                        Error: {run.outcome.error}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}

            {sortedRuns.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No sub-agent runs yet</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

import { useQuery } from "@tanstack/react-query"
import { getRuns, getAgents } from "@/api/observatory"
import { getAgentEmoji } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"

interface DelegationEdge {
  from: string
  to: string
  count: number
  successRate: number
}

interface AgentNode {
  id: string
  name: string
  totalDelegations: number
  receivedDelegations: number
}

export function DelegationGraph() {
  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ["runs"],
    queryFn: getRuns,
  })

  const { data: agentsData, isLoading: agentsLoading } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
  })

  const isLoading = runsLoading || agentsLoading

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const agents = agentsData?.agents || []
  const runs = runsData?.runs ? Object.values(runsData.runs) : []

  // Build delegation map
  const delegationMap = new Map<string, DelegationEdge>()
  const agentNodes = new Map<string, AgentNode>()

  // Initialize agent nodes
  agents.forEach(agent => {
    agentNodes.set(agent.id, {
      id: agent.id,
      name: agent.name,
      totalDelegations: 0,
      receivedDelegations: 0,
    })
  })

  // Process runs
  runs.forEach(run => {
    const fromAgent = run.requesterSessionKey.split(':')[1]
    const toAgent = run.childSessionKey.split(':')[1]

    if (!fromAgent || !toAgent) return

    const key = `${fromAgent}->${toAgent}`
    const existing = delegationMap.get(key)

    if (existing) {
      existing.count++
      if (run.outcome?.success) {
        existing.successRate = ((existing.successRate * (existing.count - 1)) + 100) / existing.count
      } else {
        existing.successRate = (existing.successRate * (existing.count - 1)) / existing.count
      }
    } else {
      delegationMap.set(key, {
        from: fromAgent,
        to: toAgent,
        count: 1,
        successRate: run.outcome?.success ? 100 : 0,
      })
    }

    // Update node stats
    const fromNode = agentNodes.get(fromAgent)
    const toNode = agentNodes.get(toAgent)
    if (fromNode) fromNode.totalDelegations++
    if (toNode) toNode.receivedDelegations++
  })

  const edges = Array.from(delegationMap.values())
  const nodes = Array.from(agentNodes.values()).filter(
    node => node.totalDelegations > 0 || node.receivedDelegations > 0
  )

  // Group by source agent
  const groupedEdges = new Map<string, DelegationEdge[]>()
  edges.forEach(edge => {
    const existing = groupedEdges.get(edge.from) || []
    existing.push(edge)
    groupedEdges.set(edge.from, existing)
  })

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="p-4 rounded-full bg-muted mb-4">
          <span className="text-4xl">🔀</span>
        </div>
        <p className="text-sm text-muted-foreground">No delegation data yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Agent Nodes Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {nodes.map(node => (
          <div
            key={node.id}
            className="rounded-lg border p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl">{getAgentEmoji(node.id)}</span>
              <div>
                <div className="font-semibold">{node.name}</div>
                <div className="text-xs text-muted-foreground">{node.id}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <div className="text-muted-foreground">Delegated</div>
                <div className="font-bold text-blue-600 dark:text-blue-400">
                  {node.totalDelegations}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Received</div>
                <div className="font-bold text-green-600 dark:text-green-400">
                  {node.receivedDelegations}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delegation Edges */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg">Delegation Paths</h3>
        {Array.from(groupedEdges.entries()).map(([fromAgent, edges]) => (
          <div key={fromAgent} className="rounded-lg border p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">{getAgentEmoji(fromAgent)}</span>
              <span className="font-semibold capitalize">{fromAgent}</span>
              <Badge variant="outline">{edges.reduce((sum, e) => sum + e.count, 0)} delegations</Badge>
            </div>
            <div className="space-y-2 ml-6">
              {edges.map(edge => {
                const successColor = edge.successRate >= 90 
                  ? "text-green-600 dark:text-green-400" 
                  : edge.successRate >= 70 
                  ? "text-yellow-600 dark:text-yellow-400" 
                  : "text-red-600 dark:text-red-400"

                // Calculate line thickness (1-5 based on count)
                const thickness = Math.min(Math.max(Math.ceil(edge.count / 2), 1), 5)

                return (
                  <div
                    key={edge.to}
                    className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30"
                  >
                    <div 
                      className={`flex items-center gap-2 flex-1 ${successColor}`}
                      style={{ 
                        borderLeft: `${thickness}px solid currentColor`,
                        paddingLeft: "12px"
                      }}
                    >
                      <span className="text-xl">{getAgentEmoji(edge.to)}</span>
                      <span className="font-medium capitalize">{edge.to}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Badge variant="secondary">{edge.count}x</Badge>
                      <div className={`font-semibold ${successColor}`}>
                        {edge.successRate.toFixed(0)}% success
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

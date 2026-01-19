import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface AgentCost {
  agentId: string
  cost: number
  tokens: number
  sessions: number
}

export function CostByAgentChart({ data }: { data: AgentCost[] }) {
  if (!data || data.length === 0) {
    return <Card className="p-6">No cost data available</Card>
  }

  const sortedData = [...data].sort((a, b) => b.cost - a.cost)
  const totalCost = sortedData.reduce((sum, item) => sum + item.cost, 0)
  const maxCost = Math.max(...sortedData.map((d) => d.cost))

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">💰 Cost by Agent</h2>
      <div className="space-y-3">
        {sortedData.map((agent, idx) => {
          const percentage = (agent.cost / totalCost) * 100
          const barPercent = (agent.cost / maxCost) * 100

          return (
            <div key={`${agent.agentId}-${idx}`} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm truncate">
                  {agent.agentId}
                </span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {agent.sessions} sessions
                  </Badge>
                  <span className="font-mono text-sm font-semibold text-green-600 dark:text-green-400">
                    ${agent.cost.toFixed(3)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 h-6 rounded overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-400 to-emerald-600 h-full rounded transition-all flex items-center justify-end pr-2"
                    style={{
                      width: `${barPercent}%`,
                      minWidth: agent.cost > 0 ? "2px" : "0px",
                    }}
                  >
                    {barPercent > 15 && (
                      <span className="text-xs font-medium text-white">
                        {percentage.toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {(agent.tokens || 0).toLocaleString()} tokens
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 pt-4 border-t">
        <div className="flex justify-between items-center">
          <span className="font-medium">Total Cost</span>
          <span className="font-mono font-bold text-lg text-green-600 dark:text-green-400">
            ${totalCost.toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  )
}

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { TokenDistributionChart } from "@/components/analytics/TokenDistributionChart"
import { DelegationGraph } from "@/components/analytics/DelegationGraph"
import { ActivityHeatmap } from "@/components/analytics/ActivityHeatmap"

interface MetricsData {
  stats: {
    totalSessions: number
    totalMessages: number
    totalCost: number
    totalTokens: number
    totalInputTokens: number
    totalOutputTokens: number
    cacheReadTokens: number
    cacheWriteTokens: number
    byAgent: Record<string, {
      sessions: number
      messages: number
      cost: number
      tokens: number
    }>
    recentCost24h: number
    recentMessages24h: number
  }
  costByModel?: Record<string, number>
  tokensByModel?: Record<string, number>
  toolUsage?: Record<string, number>
  cacheHitRatio?: number
  avgSessionLength?: number
}

export function Analytics() {
  const [timeRange, setTimeRange] = useState("all")
  
  const { data: metricsData, isLoading } = useQuery({
    queryKey: ["/observatory/api/metrics", timeRange],
    queryFn: async () => {
      const res = await fetch(`/observatory/api/metrics?range=${timeRange}`)
      if (!res.ok) throw new Error("Failed to fetch metrics")
      return res.json() as Promise<{ data: MetricsData }>
    },
    staleTime: 30000,
  })

  const metrics = metricsData?.data
  if (isLoading) return <div className="p-6">Loading analytics...</div>
  if (!metrics) return <div className="p-6">No data available</div>

  const stats = metrics.stats
  const cacheHitRatio = (stats.cacheReadTokens / (stats.cacheReadTokens + stats.cacheWriteTokens) * 100).toFixed(1)
  const avgCostPerSession = (stats.totalCost / stats.totalSessions).toFixed(4)
  const avgTokensPerMessage = (stats.totalTokens / stats.totalMessages).toFixed(0)

  // Sort agents by cost
  const agentsByEntity = Object.entries(stats.byAgent)
    .sort((a, b) => b[1].cost - a[1].cost)
    .slice(0, 10)

  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">📊 Analytics Dashboard</h1>
        <p className="text-gray-600">Real-time metrics across all agents</p>
      </div>

      <Tabs value={timeRange} onValueChange={setTimeRange} className="w-full">
        <TabsList>
          <TabsTrigger value="24h">Last 24h</TabsTrigger>
          <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
          <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
          <TabsTrigger value="all">All Time</TabsTrigger>
        </TabsList>

        <TabsContent value={timeRange} className="space-y-6">
          {/* Key Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Cost"
              value={`$${stats.totalCost.toFixed(3)}`}
              change={`+$${stats.recentCost24h.toFixed(3)} (24h)`}
              trend="up"
            />
            <MetricCard
              label="Total Tokens"
              value={stats.totalTokens.toLocaleString()}
              change={`${avgTokensPerMessage} avg per msg`}
              trend="neutral"
            />
            <MetricCard
              label="Sessions"
              value={stats.totalSessions.toLocaleString()}
              change={`${avgCostPerSession}/session`}
              trend="neutral"
            />
            <MetricCard
              label="Cache Hit Ratio"
              value={`${cacheHitRatio}%`}
              change={`${(stats.cacheReadTokens).toLocaleString()} read tokens`}
              trend="up"
            />
          </div>

          {/* Cost Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">💰 Cost by Agent</h2>
              <div className="space-y-3">
                {agentsByEntity.map(([agentId, data]) => (
                  <div key={agentId} className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{agentId}</div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{
                            width: `${(data.cost / stats.totalCost) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-sm font-medium">${data.cost.toFixed(3)}</div>
                      <div className="text-xs text-gray-500">
                        {((data.cost / stats.totalCost) * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">📈 Cost by Model</h2>
              <div className="space-y-3">
                {metrics.costByModel &&
                  Object.entries(metrics.costByModel)
                    .sort((a, b) => b[1] - a[1])
                    .map(([model, cost]) => (
                      <div key={model} className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{model}</div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-500 h-2 rounded-full"
                              style={{
                                width: `${(cost / stats.totalCost) * 100}%`,
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-right ml-4">
                          <div className="text-sm font-medium">${cost.toFixed(3)}</div>
                          <div className="text-xs text-gray-500">
                            {((cost / stats.totalCost) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
              </div>
            </Card>
          </div>

          {/* Token Analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TokenDistributionChart
              inputTokens={stats.totalInputTokens}
              outputTokens={stats.totalOutputTokens}
              cacheReadTokens={stats.cacheReadTokens}
              cacheWriteTokens={stats.cacheWriteTokens}
            />

            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">🎯 Agent Activity</h2>
              <div className="space-y-3">
                {agentsByEntity.map(([agentId, data]) => (
                  <div key={agentId} className="border-b pb-3 last:border-0">
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{agentId}</span>
                      <span className="text-xs text-gray-500">
                        {data.messages} messages
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        {data.sessions} sessions
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {data.tokens.toLocaleString()} tokens
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Top Tools */}
          {metrics.toolUsage && Object.keys(metrics.toolUsage).length > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">🛠️ Top Tools Used</h2>
              <div className="space-y-3">
                {Object.entries(metrics.toolUsage)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 15)
                  .map(([tool, count]) => (
                    <div key={tool} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="text-sm font-medium">{tool}</div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-orange-500 h-2 rounded-full"
                            style={{
                              width: `${(count / Math.max(...Object.values(metrics.toolUsage || {}))) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <div className="text-sm font-medium">{count}</div>
                        <div className="text-xs text-gray-500">calls</div>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          )}

          {/* Agent Delegation Graph */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">🔀 Agent Collaboration</h2>
            <DelegationGraph />
          </Card>

          {/* Activity Heatmap */}
          <Card className="p-6">
            <h2 className="text-lg font-semibold mb-4">📊 Activity Patterns</h2>
            <ActivityHeatmap />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricCard({
  label,
  value,
  change,
  trend,
}: {
  label: string
  value: string
  change: string
  trend: "up" | "down" | "neutral"
}) {
  const trendColor = {
    up: "text-green-600",
    down: "text-red-600",
    neutral: "text-gray-600",
  }[trend]

  const trendArrow = {
    up: "↑",
    down: "↓",
    neutral: "→",
  }[trend]

  return (
    <Card className="p-6">
      <p className="text-sm text-gray-600 mb-2">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      <p className={`text-xs mt-2 ${trendColor}`}>
        {trendArrow} {change}
      </p>
    </Card>
  )
}

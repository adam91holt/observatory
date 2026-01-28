import { useEffect, useState } from 'react'
import { getAgentEvents, getDiagnosticEvents, getHeartbeatHealth } from '@/api/observatory'
import type { LiveMetricsProps } from '@/components/metrics/LiveMetricsCards'
import type { ToolStats } from '@/components/metrics/ToolPerformanceTable'

interface ErrorEvent {
  id: string
  ts: number
  runId: string
  stream: string
  data?: {
    error?: string
    message?: string
  }
}

interface UseLiveMetricsReturn {
  metrics: LiveMetricsProps | null
  toolUsage: ToolStats[]
  errors: ErrorEvent[]
  isLoading: boolean
  error: Error | null
}

export function useLiveMetrics(): UseLiveMetricsReturn {
  const [metrics, setMetrics] = useState<LiveMetricsProps | null>(null)
  const [toolUsage, setToolUsage] = useState<ToolStats[]>([])
  const [errors, setErrors] = useState<ErrorEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        const [agentData, diagnosticsData, heartbeatData] = await Promise.all([
          getAgentEvents({ limit: 100 }),
          getDiagnosticEvents({ limit: 100 }),
          getHeartbeatHealth()
        ])

        // Calculate active sessions
        const activeSessions = agentData?.stats?.activeSessions || 0
        const totalEvents = agentData?.stats?.totalEvents || 0

        // Calculate tool usage
        const tools = new Map<string, { count: number; avgLatency: number; errors: number; latencies: number[] }>()

        agentData?.events
          ?.filter((e: any) => e.stream === 'tool')
          .forEach((event: any) => {
            const toolName = event.data?.toolName || 'unknown'
            if (!tools.has(toolName)) {
              tools.set(toolName, { count: 0, avgLatency: 0, errors: 0, latencies: [] })
            }
            const tool = tools.get(toolName)!
            tool.count++
            if (event.data?.error) tool.errors++
            if (event.data?.durationMs) tool.latencies.push(event.data.durationMs)
          })

        const toolStats: ToolStats[] = Array.from(tools.entries())
          .map(([name, stats]) => ({
            name,
            count: stats.count,
            errors: stats.errors,
            avgLatency: stats.latencies.length > 0
              ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
              : 0,
            successRate: ((stats.count - stats.errors) / stats.count * 100).toFixed(1)
          }))
          .sort((a, b) => b.count - a.count)

        const toolCallsCount = toolStats.reduce((sum, t) => sum + t.count, 0)
        const uniqueToolsCount = toolStats.length

        // Calculate model usage
        const models = new Map<string, { calls: number; tokens: number; cost: number }>()

        diagnosticsData?.events
          ?.filter((e: any) => e.type === 'model.usage')
          .forEach((event: any) => {
            const model = event.model || 'unknown'
            if (!models.has(model)) {
              models.set(model, { calls: 0, tokens: 0, cost: 0 })
            }
            const stats = models.get(model)!
            stats.calls++
            stats.tokens += (event.usage?.input || 0) + (event.usage?.output || 0)
            stats.cost += event.costUsd || 0
          })

        const totalCost = Array.from(models.values()).reduce((sum, m) => sum + m.cost, 0)
        const totalTokens = Array.from(models.values()).reduce((sum, m) => sum + m.tokens, 0)

        // Get recent errors
        const recentErrors = agentData?.events
          ?.filter((e: any) => e.stream === 'error' || e.data?.error)
          .slice(-10)
          .reverse() || []

        // Set state
        setMetrics({
          activeSessions,
          totalEvents,
          toolCalls: { count: toolCallsCount, uniqueTools: uniqueToolsCount },
          modelUsage: { cost: totalCost, tokens: totalTokens },
          health: {
            healthy: heartbeatData?.healthy || false,
            successRate: heartbeatData?.successRate || 0,
            consecutiveFailures: heartbeatData?.consecutiveFailures || 0
          }
        })

        setToolUsage(toolStats)
        setErrors(recentErrors)
        setIsLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load live metrics'))
        setIsLoading(false)
      }
    }

    loadData()
    const interval = setInterval(loadData, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [])

  return { metrics, toolUsage, errors, isLoading, error }
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, Zap, TrendingUp, CheckCircle, XCircle } from 'lucide-react'

export interface LiveMetricsProps {
  activeSessions: number
  totalEvents: number
  toolCalls: { count: number; uniqueTools: number }
  modelUsage: { cost: number; tokens: number }
  health: { healthy: boolean; successRate: number; consecutiveFailures: number }
}

export function LiveMetricsCards({ activeSessions, totalEvents, toolCalls, modelUsage, health }: LiveMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Active Sessions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{activeSessions}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {totalEvents} total events
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Tool Calls
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{toolCalls.count}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {toolCalls.uniqueTools} unique tools
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Model Usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">${modelUsage.cost.toFixed(3)}</div>
          <p className="text-xs text-muted-foreground mt-1">
            {modelUsage.tokens.toLocaleString()} tokens
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            {health.healthy ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-500" />
            )}
            Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">
            {(health.successRate * 100).toFixed(0)}%
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {health.consecutiveFailures} consecutive failures
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

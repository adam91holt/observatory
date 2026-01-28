import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface ToolStats {
  name: string
  count: number
  avgLatency: number
  errors: number
  successRate: string
}

export interface ToolPerformanceTableProps {
  tools: ToolStats[]
  limit?: number
}

export function ToolPerformanceTable({ tools, limit = 5 }: ToolPerformanceTableProps) {
  if (tools.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tool Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No tool calls yet</p>
        </CardContent>
      </Card>
    )
  }

  const displayTools = tools.slice(0, limit)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Tool Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {displayTools.map((tool) => (
            <div key={tool.name} className="flex items-center justify-between border-b pb-2">
              <div className="flex-1">
                <div className="text-sm font-medium">{tool.name}</div>
                <div className="text-xs text-muted-foreground">
                  {tool.avgLatency > 0 && `${tool.avgLatency}ms avg • `}
                  {tool.successRate}% success
                </div>
              </div>
              <Badge>{tool.count}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

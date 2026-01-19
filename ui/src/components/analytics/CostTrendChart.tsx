import { Card } from "@/components/ui/card"

interface CostTrendData {
  date: string
  cost: number
}

export function CostTrendChart({ data }: { data: CostTrendData[] }) {
  if (!data || data.length === 0) {
    return <Card className="p-6">No cost trend data available</Card>
  }

  const maxCost = Math.max(...data.map(d => d.cost))
  const minCost = Math.min(...data.map(d => d.cost))
  const range = maxCost - minCost || 1

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">📈 Cost Trend</h2>
      <div className="space-y-1 text-sm">
        {data.map((point, idx) => (
          <div key={idx} className="flex items-center gap-3">
            <div className="w-24 text-xs text-gray-500 truncate">{point.date}</div>
            <div className="flex-1 bg-gray-100 h-8 rounded relative overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-400 to-blue-600 h-full rounded transition-all"
                style={{
                  width: `${((point.cost - minCost) / range) * 100}%`,
                  minWidth: point.cost > 0 ? '2px' : '0px',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-end pr-2">
                <span className="text-xs font-medium text-gray-700">
                  ${point.cost.toFixed(3)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

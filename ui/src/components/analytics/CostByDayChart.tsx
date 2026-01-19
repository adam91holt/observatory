import { Card } from "@/components/ui/card"

interface DayCost {
  date: string
  cost: number
  tokens: number
  sessions: number
}

export function CostByDayChart({ data }: { data: DayCost[] }) {
  if (!data || data.length === 0) {
    return <Card className="p-6">No daily cost data available</Card>
  }

  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const maxCost = Math.max(...sortedData.map((d) => d.cost))
  const totalCost = sortedData.reduce((sum, item) => sum + item.cost, 0)
  const avgCost = totalCost / sortedData.length

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">📅 Cost by Day</h2>
      <div className="space-y-3">
        {sortedData.map((day, idx) => {
          const barPercent = (day.cost / maxCost) * 100
          const dateObj = new Date(day.date)
          const dateStr = dateObj.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })

          return (
            <div key={`${day.date}-${idx}`} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="w-16 text-xs font-medium text-gray-600">
                  {dateStr}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">
                    {day.sessions} sessions
                  </span>
                  <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400 w-14 text-right">
                    ${day.cost.toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 h-8 rounded overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-blue-600 h-full rounded transition-all flex items-center justify-end pr-2"
                    style={{
                      width: `${barPercent}%`,
                      minWidth: day.cost > 0 ? "2px" : "0px",
                    }}
                  >
                    {barPercent > 20 && (
                      <span className="text-xs font-medium text-white">
                        {barPercent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-xs text-gray-500">
                {(day.tokens || 0).toLocaleString()} tokens
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-4 pt-4 border-t space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium">Total</span>
          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
            ${totalCost.toFixed(2)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-600">Daily Average</span>
          <span className="font-mono text-sm text-gray-600">
            ${avgCost.toFixed(2)}
          </span>
        </div>
      </div>
    </Card>
  )
}

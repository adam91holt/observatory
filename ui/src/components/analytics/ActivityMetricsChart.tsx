import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface HourActivity {
  hour: string
  sessions: number
  messages: number
  cost: number
}

export function ActivityMetricsChart({ data }: { data: HourActivity[] }) {
  if (!data || data.length === 0) {
    return <Card className="p-6">No activity data available</Card>
  }

  const maxSessions = Math.max(...data.map((d) => d.sessions), 1)
  const totalSessions = data.reduce((sum, item) => sum + item.sessions, 0)
  const totalMessages = data.reduce((sum, item) => sum + item.messages, 0)

  // Find peak hour
  const peakHour = data.reduce((prev, curr) =>
    curr.sessions > prev.sessions ? curr : prev
  )

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold mb-4">⏰ Hourly Activity</h2>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6 pb-4 border-b">
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {totalSessions}
          </div>
          <div className="text-xs text-gray-600">Sessions</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {totalMessages}
          </div>
          <div className="text-xs text-gray-600">Messages</div>
        </div>
        <div className="text-center">
          <div className="text-xl font-bold text-green-600 dark:text-green-400">
            {(data.reduce((sum, d) => sum + d.cost, 0)).toFixed(2)}
          </div>
          <div className="text-xs text-gray-600">Cost ($)</div>
        </div>
      </div>

      {/* Hourly Breakdown */}
      <div className="space-y-2">
        {data.map((hour, idx) => {
          const barPercent = (hour.sessions / maxSessions) * 100
          const isPeak = hour.hour === peakHour.hour

          return (
            <div key={`${hour.hour}-${idx}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium w-12">{hour.hour}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={isPeak ? "default" : "secondary"} className="text-xs">
                    {hour.sessions} sessions
                  </Badge>
                  <span className="text-xs text-gray-500 w-8 text-right">
                    {hour.messages}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-gray-100 h-6 rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all flex items-center justify-end pr-2 ${
                      isPeak
                        ? "bg-gradient-to-r from-red-400 to-red-600"
                        : "bg-gradient-to-r from-purple-400 to-purple-600"
                    }`}
                    style={{
                      width: `${barPercent}%`,
                      minWidth: hour.sessions > 0 ? "2px" : "0px",
                    }}
                  >
                    {barPercent > 15 && (
                      <span className="text-xs font-medium text-white">
                        {barPercent.toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Peak Hour Info */}
      <div className="mt-4 pt-4 border-t bg-amber-50 dark:bg-amber-900/20 p-3 rounded">
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">Peak Activity Hour</p>
        <p className="font-semibold">
          {peakHour.hour} — {peakHour.sessions} sessions, {peakHour.messages} messages
        </p>
      </div>
    </Card>
  )
}

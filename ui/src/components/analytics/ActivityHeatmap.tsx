import { useQuery } from "@tanstack/react-query"
import { getSessions } from "@/api/observatory"
import { Skeleton } from "@/components/ui/skeleton"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const HOURS = Array.from({ length: 24 }, (_, i) => i)

interface HeatmapCell {
  day: number
  hour: number
  count: number
}

export function ActivityHeatmap() {
  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
  })

  if (isLoading) {
    return <Skeleton className="h-96 w-full" />
  }

  const sessions = sessionsData?.sessions || []

  // Build heatmap data
  const heatmapData = new Map<string, number>()

  sessions.forEach(session => {
    const date = new Date(session.updatedAt)
    const day = date.getDay() // 0-6 (Sun-Sat)
    const hour = date.getHours() // 0-23
    const key = `${day}-${hour}`
    heatmapData.set(key, (heatmapData.get(key) || 0) + 1)
  })

  // Find max for scaling
  const maxCount = Math.max(...Array.from(heatmapData.values()), 1)

  // Generate cells
  const cells: HeatmapCell[] = []
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const key = `${day}-${hour}`
      cells.push({
        day,
        hour,
        count: heatmapData.get(key) || 0,
      })
    }
  }

  const getColor = (count: number) => {
    if (count === 0) return "bg-muted"
    const intensity = count / maxCount
    if (intensity < 0.25) return "bg-green-200 dark:bg-green-900/50"
    if (intensity < 0.5) return "bg-green-400 dark:bg-green-700"
    if (intensity < 0.75) return "bg-green-600 dark:bg-green-500"
    return "bg-green-800 dark:bg-green-300"
  }

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="p-4 rounded-full bg-muted mb-4">
          <span className="text-4xl">📊</span>
        </div>
        <p className="text-sm text-muted-foreground">No activity data yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Activity by Day and Hour</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded bg-muted" />
            <div className="w-3 h-3 rounded bg-green-200 dark:bg-green-900/50" />
            <div className="w-3 h-3 rounded bg-green-400 dark:bg-green-700" />
            <div className="w-3 h-3 rounded bg-green-600 dark:bg-green-500" />
            <div className="w-3 h-3 rounded bg-green-800 dark:bg-green-300" />
          </div>
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* Hour labels */}
          <div className="flex">
            <div className="w-12" /> {/* Spacer for day labels */}
            {HOURS.map(hour => (
              <div
                key={hour}
                className="flex-shrink-0 w-6 text-center text-xs text-muted-foreground"
              >
                {hour % 3 === 0 ? hour : ""}
              </div>
            ))}
          </div>

          {/* Heatmap grid */}
          {DAYS.map((dayName, day) => (
            <div key={day} className="flex items-center">
              <div className="w-12 text-xs text-muted-foreground pr-2 text-right">
                {dayName}
              </div>
              {HOURS.map(hour => {
                const cell = cells.find(c => c.day === day && c.hour === hour)
                const count = cell?.count || 0
                return (
                  <div
                    key={hour}
                    className={`flex-shrink-0 w-6 h-6 m-0.5 rounded ${getColor(count)} cursor-pointer hover:ring-2 hover:ring-primary transition-all`}
                    title={`${dayName} ${hour}:00 - ${count} sessions`}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Total sessions: {sessions.length} · Peak: {maxCount} sessions/hour
      </div>
    </div>
  )
}

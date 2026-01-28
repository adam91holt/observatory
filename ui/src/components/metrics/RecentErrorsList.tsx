import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle } from 'lucide-react'

interface ErrorEvent {
  id: string
  ts: number
  runId: string
  data?: {
    error?: string
    message?: string
  }
}

export interface RecentErrorsListProps {
  errors: ErrorEvent[]
  limit?: number
}

function formatTimestamp(ts: number) {
  const now = Date.now()
  const diff = now - ts
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ts).toLocaleString()
}

export function RecentErrorsList({ errors, limit = 5 }: RecentErrorsListProps) {
  if (errors.length === 0) {
    return null
  }

  const displayErrors = errors.slice(0, limit)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-500" />
          Recent Errors
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {displayErrors.map((error) => (
            <div key={error.id} className="border-l-4 border-red-500 pl-3 py-2">
              <div className="text-sm font-medium">
                {error.data?.error || error.data?.message || 'Unknown error'}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatTimestamp(error.ts)} • Run: {error.runId.slice(0, 8)}...
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

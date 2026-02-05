/**
 * System Health Bar — persistent top-of-dashboard fleet overview
 *
 * Compact, single-row bar showing system-wide metrics:
 *  - Gateway status (connected/disconnected) with color indicator
 *  - Uptime
 *  - Total agents & active sessions
 *  - Messages/min rate, total tokens today, error count (last hour)
 *
 * Updates in real-time via WebSocket + polling.
 *
 * Issue: #16 System Health Bar
 */

import { useMemo } from 'react'
import {
  Wifi,
  WifiOff,
  Clock,
  Users,
  Activity,
  MessageSquare,
  Coins,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useGatewayState } from '@/hooks/useWebSocket'
import { useAuthStore } from '@/store/auth'
import type { LiveMetricsProps } from '@/components/metrics/LiveMetricsCards'

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface SystemHealthBarProps {
  /** Total configured agents */
  totalAgents: number
  /** Active sessions (from live metrics or sessions query) */
  activeSessions: number
  /** Live metrics data (may be null while loading) */
  metrics: LiveMetricsProps | null
  /** Recent error count (last hour) */
  errorCount: number
  /** Whether data is still loading */
  isLoading?: boolean
}

// ---------------------------------------------------------------------------
//  Status helpers
// ---------------------------------------------------------------------------

type StatusColor = 'green' | 'yellow' | 'red' | 'gray'

function statusDot(color: StatusColor) {
  const colors: Record<StatusColor, string> = {
    green: 'bg-[#22C55E] shadow-[0_0_6px_rgba(34,197,94,0.5)]',
    yellow: 'bg-[#F59E0B] shadow-[0_0_6px_rgba(245,158,11,0.5)]',
    red: 'bg-[#EF4444] shadow-[0_0_6px_rgba(239,68,68,0.5)]',
    gray: 'bg-gray-500',
  }
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full flex-shrink-0',
        colors[color],
        color !== 'gray' && 'animate-pulse',
      )}
    />
  )
}

function formatUptime(ms: number): string {
  if (ms <= 0) return '—'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toString()
}

// ---------------------------------------------------------------------------
//  Metric cell — reusable inline stat
// ---------------------------------------------------------------------------

interface MetricCellProps {
  icon: React.ReactNode
  label: string
  value: string | number
  color?: StatusColor
  title?: string
}

function MetricCell({ icon, label, value, color, title }: MetricCellProps) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 text-xs whitespace-nowrap"
      title={title}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-muted-foreground hidden sm:inline">{label}</span>
      <span className="font-semibold font-mono flex items-center gap-1.5">
        {color && statusDot(color)}
        {value}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Main component
// ---------------------------------------------------------------------------

export function SystemHealthBar({
  totalAgents,
  activeSessions,
  metrics,
  errorCount,
  isLoading,
}: SystemHealthBarProps) {
  const { isConnected, health, connectionState } = useGatewayState()

  // Derive gateway status color
  const gatewayColor: StatusColor = useMemo(() => {
    if (connectionState === 'connected') {
      if (health?.status === 'healthy') return 'green'
      if (health?.status === 'degraded') return 'yellow'
      return 'red'
    }
    if (connectionState === 'connecting') return 'yellow'
    return 'red'
  }, [connectionState, health?.status])

  const gatewayLabel = useMemo(() => {
    if (connectionState === 'connected') return 'Connected'
    if (connectionState === 'connecting') return 'Connecting…'
    return 'Disconnected'
  }, [connectionState])

  // Derive uptime from gateway snapshot (stored in auth store)
  const gatewaySnapshot = useAuthStore((s) => s.gatewaySnapshot)
  const uptimeMs = gatewaySnapshot?.uptimeMs ?? 0

  // Error count color
  const errorColor: StatusColor =
    errorCount === 0 ? 'green' : errorCount <= 3 ? 'yellow' : 'red'

  // Session health color
  const sessionColor: StatusColor =
    activeSessions > 0 ? 'green' : 'gray'

  // Messages per minute — rough estimate from totalEvents / session time
  const messagesPerMin = metrics?.totalEvents
    ? Math.round(metrics.totalEvents / Math.max(1, uptimeMs / 60_000))
    : 0

  // Total tokens today
  const tokensToday = metrics?.modelUsage?.tokens ?? 0

  if (isLoading) {
    return (
      <div className="flex items-center h-10 rounded-lg border border-border/50 bg-card/50 backdrop-blur-sm px-2 animate-pulse">
        <div className="flex items-center gap-4 w-full">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-4 w-20 rounded bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-center flex-wrap gap-y-1 rounded-lg border border-border/50 bg-card/80 backdrop-blur-sm divide-x divide-border/50 overflow-hidden">
      {/* Gateway Status */}
      <MetricCell
        icon={
          isConnected ? (
            <Wifi className="h-3.5 w-3.5 text-[#22C55E]" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 text-[#EF4444]" />
          )
        }
        label="Gateway"
        value={gatewayLabel}
        color={gatewayColor}
        title={`Gateway: ${gatewayLabel}${health?.status ? ` (${health.status})` : ''}`}
      />

      {/* Uptime */}
      <MetricCell
        icon={<Clock className="h-3.5 w-3.5" />}
        label="Uptime"
        value={formatUptime(uptimeMs)}
        title={`Gateway uptime: ${formatUptime(uptimeMs)}`}
      />

      {/* Total Agents */}
      <MetricCell
        icon={<Users className="h-3.5 w-3.5" />}
        label="Agents"
        value={totalAgents}
        title={`${totalAgents} configured agents`}
      />

      {/* Active Sessions */}
      <MetricCell
        icon={<Activity className="h-3.5 w-3.5" />}
        label="Active"
        value={activeSessions}
        color={sessionColor}
        title={`${activeSessions} active sessions`}
      />

      {/* Messages/min */}
      <MetricCell
        icon={<MessageSquare className="h-3.5 w-3.5" />}
        label="Msg/min"
        value={messagesPerMin}
        title={`≈${messagesPerMin} messages per minute`}
      />

      {/* Total Tokens Today */}
      <MetricCell
        icon={<Coins className="h-3.5 w-3.5" />}
        label="Tokens"
        value={formatCompactTokens(tokensToday)}
        title={`${tokensToday.toLocaleString()} tokens today`}
      />

      {/* Errors (last hour) */}
      <MetricCell
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        label="Errors"
        value={errorCount}
        color={errorColor}
        title={`${errorCount} errors in the last hour`}
      />
    </div>
  )
}

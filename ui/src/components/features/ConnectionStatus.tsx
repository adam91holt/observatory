/**
 * Connection Status Component
 * Displays real-time Gateway connection health with live metrics summary
 *
 * Issue: #30 WebSocket Client Integration
 * Issue: #17 Real-Time Updates — enhanced with live sync indicators
 */

import { useEffect, useState } from 'react'
import { Wifi, WifiOff, AlertCircle, CheckCircle2, Loader2, Activity } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useGatewayState } from '@/hooks/useWebSocket'
import { useAuthStore } from '@/store/auth'
import { useSessionsStore } from '@/store/sessions'
import { useMetricsStore } from '@/store/metrics'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface ConnectionStatusProps {
  compact?: boolean
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function ConnectionStatus({ compact = false }: ConnectionStatusProps) {
  const { connectionState, health, presence, isConnected } = useGatewayState()
  const { gatewayUrl, gatewaySnapshot } = useAuthStore()
  const sessionsInitialized = useSessionsStore((s) => s.initialized)
  const sessionCount = useSessionsStore((s) => s.sessions.size)
  const lastSessionUpdate = useSessionsStore((s) => s.lastUpdateAt)
  const lastMetricsUpdate = useMetricsStore((s) => s.lastUpdateAt)

  // Track "last event" recency for a pulse indicator
  const [lastEventAgo, setLastEventAgo] = useState<string>('—')

  useEffect(() => {
    const lastUpdate = Math.max(lastSessionUpdate, lastMetricsUpdate)
    if (lastUpdate === 0) {
      setLastEventAgo('—')
      return
    }

    function update() {
      const ago = Date.now() - lastUpdate
      if (ago < 1000) setLastEventAgo('just now')
      else if (ago < 60_000) setLastEventAgo(`${Math.floor(ago / 1000)}s ago`)
      else if (ago < 3_600_000) setLastEventAgo(`${Math.floor(ago / 60_000)}m ago`)
      else setLastEventAgo(`${Math.floor(ago / 3_600_000)}h ago`)
    }

    update()
    const interval = setInterval(update, 5_000)
    return () => clearInterval(interval)
  }, [lastSessionUpdate, lastMetricsUpdate])

  // -----------------------------------------------------------------------
  //  Compact mode — for header/footer bars
  // -----------------------------------------------------------------------

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <StatusIndicator state={connectionState} />
        <span className="text-sm text-muted-foreground">
          {isConnected
            ? `${presence.length} client${presence.length !== 1 ? 's' : ''}`
            : connectionState}
        </span>
        {isConnected && sessionsInitialized && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="text-sm text-muted-foreground">
              {sessionCount} session{sessionCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {isConnected && (
          <LivePulse lastEventAgo={lastEventAgo} />
        )}
      </div>
    )
  }

  // -----------------------------------------------------------------------
  //  Full card mode
  // -----------------------------------------------------------------------

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Gateway Connection</span>
          <StatusIndicator state={connectionState} withLabel />
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Details */}
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Endpoint</span>
            <span className="font-mono text-xs">{formatUrl(gatewayUrl)}</span>
          </div>
          {gatewaySnapshot && (
            <>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Uptime</span>
                <span>{formatDuration(gatewaySnapshot.uptimeMs)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Clients</span>
                <span>{presence.length}</span>
              </div>
            </>
          )}
          {sessionsInitialized && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sessions</span>
              <span>{sessionCount}</span>
            </div>
          )}
          {isConnected && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Last event</span>
              <span className="flex items-center gap-1.5">
                <LivePulse lastEventAgo={lastEventAgo} />
              </span>
            </div>
          )}
        </div>

        {/* Real-time sync status */}
        {isConnected && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Live Sync</span>
            <div className="rounded-md bg-muted/50 p-2 space-y-1">
              <SyncStatusRow
                label="Sessions"
                synced={sessionsInitialized}
                count={sessionCount}
              />
              <SyncStatusRow
                label="Metrics"
                synced={lastMetricsUpdate > 0}
              />
              <SyncStatusRow
                label="Presence"
                synced={presence.length > 0}
                count={presence.length}
              />
            </div>
          </div>
        )}

        {/* Health Status */}
        {health && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Health</span>
              <HealthBadge status={health.status} />
            </div>

            {Object.entries(health.components || {}).length > 0 && (
              <div className="rounded-md bg-muted/50 p-2 space-y-1">
                {Object.entries(health.components).map(([name, component]) => (
                  <div key={name} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{name}</span>
                    <ComponentStatus status={component.status} message={component.message} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Connected Clients */}
        {presence.length > 0 && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Connected Clients</span>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {presence.map((entry) => (
                <div
                  key={entry.instanceId}
                  className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <span>{entry.host || entry.instanceId}</span>
                  </div>
                  <span className="text-muted-foreground">{entry.mode}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

function StatusIndicator({
  state,
  withLabel = false,
}: {
  state: string
  withLabel?: boolean
}) {
  const configs: Record<string, {
    icon: typeof Wifi
    color: string
    bgColor: string
    label: string
    animate?: boolean
  }> = {
    connected: {
      icon: Wifi,
      color: 'text-green-500',
      bgColor: 'bg-green-500',
      label: 'Connected',
    },
    connecting: {
      icon: Loader2,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500',
      label: 'Connecting',
      animate: true,
    },
    disconnected: {
      icon: WifiOff,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted-foreground',
      label: 'Disconnected',
    },
    error: {
      icon: AlertCircle,
      color: 'text-red-500',
      bgColor: 'bg-red-500',
      label: 'Error',
    },
  }

  const config = configs[state] ?? configs.disconnected!

  const Icon = config.icon

  if (withLabel) {
    return (
      <div className="flex items-center gap-2">
        <div className={cn('h-2 w-2 rounded-full', config.bgColor)} />
        <span className={cn('text-sm', config.color)}>{config.label}</span>
      </div>
    )
  }

  return (
    <Icon
      className={cn(
        'h-4 w-4',
        config.color,
        config.animate && 'animate-spin',
      )}
    />
  )
}

/** Pulsing activity indicator showing last event recency */
function LivePulse({ lastEventAgo }: { lastEventAgo: string }) {
  const isRecent = lastEventAgo === 'just now' || lastEventAgo.endsWith('s ago')

  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Activity
        className={cn(
          'h-3 w-3',
          isRecent ? 'text-green-500 animate-pulse' : 'text-muted-foreground/50',
        )}
      />
      <span>{lastEventAgo}</span>
    </span>
  )
}

/** Row showing sync status for a data domain */
function SyncStatusRow({
  label,
  synced,
  count,
}: {
  label: string
  synced: boolean
  count?: number
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1">
        {synced ? (
          <>
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            <span className="text-green-600">{count !== undefined ? count : 'synced'}</span>
          </>
        ) : (
          <>
            <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
            <span className="text-yellow-600">waiting</span>
          </>
        )}
      </span>
    </div>
  )
}

function HealthBadge({ status }: { status: string }) {
  const variants: Record<
    string,
    { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }
  > = {
    healthy: { variant: 'default', icon: CheckCircle2 },
    degraded: { variant: 'secondary', icon: AlertCircle },
    unhealthy: { variant: 'destructive', icon: AlertCircle },
  }

  const config = variants[status] ?? variants.unhealthy!
  const Icon = config.icon

  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  )
}

function ComponentStatus({ status, message }: { status: string; message?: string }) {
  const colors: Record<string, string> = {
    healthy: 'text-green-500',
    ok: 'text-green-500',
    degraded: 'text-yellow-500',
    warning: 'text-yellow-500',
    unhealthy: 'text-red-500',
    error: 'text-red-500',
  }

  return (
    <span className={cn(colors[status] ?? 'text-muted-foreground')} title={message}>
      {status}
    </span>
  )
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function formatUrl(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.host}`
  } catch {
    return url
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

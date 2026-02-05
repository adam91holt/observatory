/**
 * Cost Summary Card — Displays estimated cost breakdown for an agent
 * including per-model costs, token efficiency, and rate metrics.
 *
 * Issue: #20 Token Usage Chart (Agent Detail View)
 */

import { useMemo } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatTokens, formatCost } from "@/lib/utils"

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

/** Pricing per 1M tokens (USD) — common model rates */
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead?: number }> = {
  "claude-opus-4": { input: 15, output: 75, cacheRead: 1.5 },
  "claude-sonnet-4": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-3.5-sonnet": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-3.5-haiku": { input: 0.8, output: 4, cacheRead: 0.08 },
  "claude-3-haiku": { input: 0.25, output: 1.25, cacheRead: 0.03 },
  "gpt-4o": { input: 2.5, output: 10, cacheRead: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cacheRead: 0.075 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "o3-mini": { input: 1.1, output: 4.4 },
}

/** Fallback pricing when model is unknown */
const DEFAULT_PRICING = { input: 3, output: 15, cacheRead: 0.3 }

export interface ModelCostEntry {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  calls: number
}

export interface CostSummaryProps {
  /** Per-model usage data */
  models: ModelCostEntry[]
  /** Optional: pre-computed total cost (overrides estimation) */
  totalCostUsd?: number
  /** Time period label (e.g. "Last 24h") */
  periodLabel?: string
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function findPricing(model: string): { input: number; output: number; cacheRead: number } {
  // Try exact match first, then partial
  const lower = model.toLowerCase()
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (lower.includes(key.toLowerCase())) {
      return { ...DEFAULT_PRICING, ...pricing }
    }
  }
  return DEFAULT_PRICING
}

function estimateCost(entry: ModelCostEntry): number {
  const pricing = findPricing(entry.model)
  const inputCost = (entry.inputTokens / 1_000_000) * pricing.input
  const outputCost = (entry.outputTokens / 1_000_000) * pricing.output
  const cacheSavings = (entry.cacheReadTokens / 1_000_000) * (pricing.input - pricing.cacheRead)
  return inputCost + outputCost - cacheSavings
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function CostSummary({
  models,
  totalCostUsd,
  periodLabel,
}: CostSummaryProps) {
  const breakdown = useMemo(() => {
    return models
      .map((m) => ({
        ...m,
        estimatedCost: estimateCost(m),
        totalTokens: m.inputTokens + m.outputTokens,
      }))
      .sort((a, b) => b.estimatedCost - a.estimatedCost)
  }, [models])

  const totals = useMemo(() => {
    const input = models.reduce((s, m) => s + m.inputTokens, 0)
    const output = models.reduce((s, m) => s + m.outputTokens, 0)
    const cacheRead = models.reduce((s, m) => s + m.cacheReadTokens, 0)
    const cacheWrite = models.reduce((s, m) => s + m.cacheWriteTokens, 0)
    const calls = models.reduce((s, m) => s + m.calls, 0)
    const estimated = breakdown.reduce((s, m) => s + m.estimatedCost, 0)
    const cacheTotal = cacheRead + cacheWrite
    const cacheHitRate = cacheTotal > 0 ? (cacheRead / cacheTotal) * 100 : 0
    // Calculate cache savings
    const cacheSavings = models.reduce((s, m) => {
      const pricing = findPricing(m.model)
      return s + (m.cacheReadTokens / 1_000_000) * (pricing.input - pricing.cacheRead)
    }, 0)

    return {
      input,
      output,
      cacheRead,
      cacheWrite,
      calls,
      estimated,
      cacheHitRate,
      cacheSavings,
      total: input + output,
    }
  }, [models, breakdown])

  const displayCost = totalCostUsd ?? totals.estimated

  if (models.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-semibold mb-2">💰 Cost Summary</h3>
        <p className="text-sm text-muted-foreground">No usage data available</p>
      </Card>
    )
  }

  return (
    <Card className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">💰 Cost Summary</h3>
        {periodLabel && (
          <Badge variant="secondary" className="text-xs">
            {periodLabel}
          </Badge>
        )}
      </div>

      {/* Primary cost figure */}
      <div className="text-center py-3 bg-muted/50 rounded-lg">
        <p className="text-3xl font-bold">{formatCost(displayCost)}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {totalCostUsd != null ? "Actual cost" : "Estimated cost"}
        </p>
      </div>

      {/* Key metrics grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCell
          label="Total Tokens"
          value={formatTokens(totals.total)}
          sub={`${totals.calls} API calls`}
        />
        <MetricCell
          label="Avg Tokens/Call"
          value={formatTokens(
            totals.calls > 0 ? Math.round(totals.total / totals.calls) : 0,
          )}
          sub={`${formatTokens(totals.calls > 0 ? Math.round(totals.input / totals.calls) : 0)} in / ${formatTokens(totals.calls > 0 ? Math.round(totals.output / totals.calls) : 0)} out`}
        />
        <MetricCell
          label="Cache Hit Rate"
          value={`${totals.cacheHitRate.toFixed(1)}%`}
          badge={
            totals.cacheHitRate > 60
              ? "success"
              : totals.cacheHitRate > 30
                ? "warning"
                : "secondary"
          }
          sub={`${formatTokens(totals.cacheRead)} reads`}
        />
        <MetricCell
          label="Cache Savings"
          value={formatCost(totals.cacheSavings)}
          sub={totals.cacheSavings > 0 ? "saved via cache" : "no cache savings"}
          badge={totals.cacheSavings > 0 ? "success" : "secondary"}
        />
      </div>

      {/* Per-model breakdown table */}
      {breakdown.length > 0 && (
        <div className="space-y-2 border-t pt-4">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Cost by Model
          </h4>
          <div className="space-y-3">
            {breakdown.map((m) => {
              const pct =
                displayCost > 0 ? (m.estimatedCost / displayCost) * 100 : 0

              return (
                <div key={m.model} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[55%]">
                      {m.model}
                    </span>
                    <span className="font-semibold">
                      {formatCost(m.estimatedCost)}
                    </span>
                  </div>

                  {/* Cost proportion bar */}
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                      style={{ width: `${Math.max(pct, 1)}%` }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      {formatTokens(m.inputTokens)} in /{" "}
                      {formatTokens(m.outputTokens)} out
                    </span>
                    <span>{m.calls} calls · {pct.toFixed(1)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Token composition bar */}
      <div className="border-t pt-4 space-y-2">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Token Composition
        </h4>
        <div className="flex h-6 rounded-lg overflow-hidden bg-muted">
          {totals.total > 0 && (
            <>
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${(totals.input / totals.total) * 100}%` }}
                title={`Input: ${totals.input.toLocaleString()}`}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${(totals.output / totals.total) * 100}%` }}
                title={`Output: ${totals.output.toLocaleString()}`}
              />
            </>
          )}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            Input: {formatTokens(totals.input)} (
            {totals.total > 0
              ? ((totals.input / totals.total) * 100).toFixed(1)
              : "0"}
            %)
          </span>
          <span>
            Output: {formatTokens(totals.output)} (
            {totals.total > 0
              ? ((totals.output / totals.total) * 100).toFixed(1)
              : "0"}
            %)
          </span>
        </div>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
//  MetricCell sub-component
// ---------------------------------------------------------------------------

function MetricCell({
  label,
  value,
  sub,
  badge,
}: {
  label: string
  value: string
  sub?: string
  badge?: "success" | "warning" | "secondary"
}) {
  return (
    <div className="p-3 bg-muted/30 rounded-lg">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      {badge ? (
        <Badge variant={badge} className="text-sm font-semibold">
          {value}
        </Badge>
      ) : (
        <p className="text-lg font-semibold">{value}</p>
      )}
      {sub && (
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      )}
    </div>
  )
}

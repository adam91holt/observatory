/**
 * Token Usage Chart — SVG area chart showing input vs output token consumption
 * over time for an individual agent.
 *
 * Issue: #20 Token Usage Chart (Agent Detail View)
 */

import { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { formatTokens } from "@/lib/utils"

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface TokenDataPoint {
  timestamp: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  model?: string
}

export type TimeRange = "1h" | "6h" | "24h" | "7d" | "30d"

interface TokenUsageChartProps {
  data: TokenDataPoint[]
  /** Currently selected time range */
  timeRange?: TimeRange
  /** Callback when range changes */
  onTimeRangeChange?: (range: TimeRange) => void
  /** Title override */
  title?: string
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const TIME_RANGES: { value: TimeRange; label: string; ms: number }[] = [
  { value: "1h", label: "1H", ms: 60 * 60 * 1000 },
  { value: "6h", label: "6H", ms: 6 * 60 * 60 * 1000 },
  { value: "24h", label: "24H", ms: 24 * 60 * 60 * 1000 },
  { value: "7d", label: "7D", ms: 7 * 24 * 60 * 60 * 1000 },
  { value: "30d", label: "30D", ms: 30 * 24 * 60 * 60 * 1000 },
]

const CHART_PADDING = { top: 20, right: 16, bottom: 32, left: 56 }
const Y_TICK_COUNT = 5
const INPUT_COLOR = "#3b82f6" // blue-500
const OUTPUT_COLOR = "#10b981" // emerald-500
const INPUT_FILL = "rgba(59, 130, 246, 0.15)"
const OUTPUT_FILL = "rgba(16, 185, 129, 0.12)"

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function bucketData(
  data: TokenDataPoint[],
  rangeMs: number,
  bucketCount: number,
): { timestamp: number; inputTokens: number; outputTokens: number }[] {
  const now = Date.now()
  const start = now - rangeMs
  const bucketSize = rangeMs / bucketCount

  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    timestamp: start + bucketSize * (i + 0.5),
    inputTokens: 0,
    outputTokens: 0,
  }))

  for (const point of data) {
    if (point.timestamp < start || point.timestamp > now) continue
    const idx = Math.min(
      Math.floor((point.timestamp - start) / bucketSize),
      bucketCount - 1,
    )
    if (idx >= 0) {
      buckets[idx].inputTokens += point.inputTokens
      buckets[idx].outputTokens += point.outputTokens
    }
  }

  return buckets
}

function formatTimeLabel(ts: number, range: TimeRange): string {
  const d = new Date(ts)
  if (range === "1h" || range === "6h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  if (range === "24h") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}

function niceYTicks(max: number, count: number): number[] {
  if (max === 0) return Array.from({ length: count }, (_, i) => i)
  const raw = max / (count - 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)))
  const nice = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= raw) ?? 10
  const step = nice * magnitude
  return Array.from({ length: count }, (_, i) => Math.round(i * step))
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function TokenUsageChart({
  data,
  timeRange: controlledRange,
  onTimeRangeChange,
  title = "Token Usage",
}: TokenUsageChartProps) {
  const [internalRange, setInternalRange] = useState<TimeRange>("24h")
  const activeRange = controlledRange ?? internalRange

  const handleRangeChange = useCallback(
    (range: TimeRange) => {
      setInternalRange(range)
      onTimeRangeChange?.(range)
    },
    [onTimeRangeChange],
  )

  const rangeMeta = TIME_RANGES.find((r) => r.value === activeRange)!
  const bucketCount = activeRange === "1h" ? 12 : activeRange === "6h" ? 18 : 24

  const buckets = useMemo(
    () => bucketData(data, rangeMeta.ms, bucketCount),
    [data, rangeMeta.ms, bucketCount],
  )

  // Totals within selected range
  const totals = useMemo(() => {
    const now = Date.now()
    const start = now - rangeMeta.ms
    const filtered = data.filter((d) => d.timestamp >= start && d.timestamp <= now)
    return {
      input: filtered.reduce((s, d) => s + d.inputTokens, 0),
      output: filtered.reduce((s, d) => s + d.outputTokens, 0),
      cacheRead: filtered.reduce((s, d) => s + (d.cacheReadTokens ?? 0), 0),
      cacheWrite: filtered.reduce((s, d) => s + (d.cacheWriteTokens ?? 0), 0),
    }
  }, [data, rangeMeta.ms])

  const totalTokens = totals.input + totals.output
  const cacheHitRate =
    totals.cacheRead + totals.cacheWrite > 0
      ? (totals.cacheRead / (totals.cacheRead + totals.cacheWrite)) * 100
      : 0

  // Chart dimensions — responsive via ref
  const containerRef = useRef<HTMLDivElement>(null)
  const [chartWidth, setChartWidth] = useState(600)
  const chartHeight = 220

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setChartWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    setChartWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  // Compute SVG geometry
  const drawW = chartWidth - CHART_PADDING.left - CHART_PADDING.right
  const drawH = chartHeight - CHART_PADDING.top - CHART_PADDING.bottom

  const maxY = Math.max(
    ...buckets.map((b) => b.inputTokens),
    ...buckets.map((b) => b.outputTokens),
    1,
  )
  const yTicks = niceYTicks(maxY, Y_TICK_COUNT)
  const yMax = yTicks[yTicks.length - 1] || 1

  const xStep = buckets.length > 1 ? drawW / (buckets.length - 1) : drawW
  const scaleY = (v: number) => drawH - (v / yMax) * drawH

  // Build SVG paths
  const buildPath = (key: "inputTokens" | "outputTokens") => {
    const points = buckets.map(
      (b, i) =>
        `${i * xStep},${scaleY(b[key])}`,
    )
    return `M${points.join("L")}`
  }

  const buildArea = (key: "inputTokens" | "outputTokens") => {
    const line = buildPath(key)
    const lastX = (buckets.length - 1) * xStep
    return `${line}L${lastX},${drawH}L0,${drawH}Z`
  }

  // Tooltip state
  const [hover, setHover] = useState<{
    idx: number
    x: number
    y: number
  } | null>(null)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = e.currentTarget
      const rect = svg.getBoundingClientRect()
      const mx = e.clientX - rect.left - CHART_PADDING.left
      if (mx < 0 || mx > drawW) {
        setHover(null)
        return
      }
      const idx = Math.min(
        Math.max(Math.round(mx / xStep), 0),
        buckets.length - 1,
      )
      setHover({
        idx,
        x: idx * xStep + CHART_PADDING.left,
        y: e.clientY - rect.top,
      })
    },
    [drawW, xStep, buckets.length],
  )

  // X-axis label indices (show ~5-6 labels max)
  const xLabelStep = Math.max(1, Math.floor(buckets.length / 5))

  const isEmpty = data.length === 0

  return (
    <Card className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold">📊 {title}</h3>
        <div className="flex gap-1">
          {TIME_RANGES.map((r) => (
            <button
              key={r.value}
              onClick={() => handleRangeChange(r.value)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                activeRange === r.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground text-xs">Total Tokens</p>
          <p className="font-semibold text-lg">{formatTokens(totalTokens)}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Input</p>
          <p className="font-semibold" style={{ color: INPUT_COLOR }}>
            {formatTokens(totals.input)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Output</p>
          <p className="font-semibold" style={{ color: OUTPUT_COLOR }}>
            {formatTokens(totals.output)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Cache Hit Rate</p>
          <Badge variant={cacheHitRate > 50 ? "success" : "secondary"}>
            {cacheHitRate.toFixed(1)}%
          </Badge>
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} className="w-full">
        {isEmpty ? (
          <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
            No token data in selected range
          </div>
        ) : (
          <svg
            width={chartWidth}
            height={chartHeight}
            className="select-none"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHover(null)}
          >
            <g transform={`translate(${CHART_PADDING.left},${CHART_PADDING.top})`}>
              {/* Y-axis grid + labels */}
              {yTicks.map((tick) => (
                <g key={tick}>
                  <line
                    x1={0}
                    x2={drawW}
                    y1={scaleY(tick)}
                    y2={scaleY(tick)}
                    className="stroke-border"
                    strokeDasharray={tick === 0 ? undefined : "4 4"}
                    strokeWidth={tick === 0 ? 1 : 0.5}
                  />
                  <text
                    x={-8}
                    y={scaleY(tick) + 4}
                    textAnchor="end"
                    className="fill-muted-foreground"
                    fontSize={10}
                  >
                    {formatTokens(tick)}
                  </text>
                </g>
              ))}

              {/* Areas */}
              <path
                d={buildArea("inputTokens")}
                fill={INPUT_FILL}
              />
              <path
                d={buildArea("outputTokens")}
                fill={OUTPUT_FILL}
              />

              {/* Lines */}
              <path
                d={buildPath("inputTokens")}
                fill="none"
                stroke={INPUT_COLOR}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={buildPath("outputTokens")}
                fill="none"
                stroke={OUTPUT_COLOR}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* X-axis labels */}
              {buckets.map((b, i) =>
                i % xLabelStep === 0 ? (
                  <text
                    key={i}
                    x={i * xStep}
                    y={drawH + 18}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    fontSize={10}
                  >
                    {formatTimeLabel(b.timestamp, activeRange)}
                  </text>
                ) : null,
              )}

              {/* Hover crosshair + dots */}
              {hover && (
                <>
                  <line
                    x1={hover.idx * xStep}
                    x2={hover.idx * xStep}
                    y1={0}
                    y2={drawH}
                    className="stroke-muted-foreground/40"
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={hover.idx * xStep}
                    cy={scaleY(buckets[hover.idx].inputTokens)}
                    r={4}
                    fill={INPUT_COLOR}
                    stroke="white"
                    strokeWidth={2}
                  />
                  <circle
                    cx={hover.idx * xStep}
                    cy={scaleY(buckets[hover.idx].outputTokens)}
                    r={4}
                    fill={OUTPUT_COLOR}
                    stroke="white"
                    strokeWidth={2}
                  />
                </>
              )}
            </g>
          </svg>
        )}
      </div>

      {/* Tooltip overlay */}
      {hover && !isEmpty && (
        <Tooltip
          bucket={buckets[hover.idx]}
          range={activeRange}
          x={hover.x}
          containerRef={containerRef}
        />
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-0.5 rounded"
            style={{ backgroundColor: INPUT_COLOR }}
          />
          Input
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-0.5 rounded"
            style={{ backgroundColor: OUTPUT_COLOR }}
          />
          Output
        </span>
      </div>

      {/* Per-model breakdown */}
      <ModelBreakdown data={data} rangeMs={rangeMeta.ms} />
    </Card>
  )
}

// ---------------------------------------------------------------------------
//  Tooltip sub-component
// ---------------------------------------------------------------------------

function Tooltip({
  bucket,
  range,
  x,
  containerRef,
}: {
  bucket: { timestamp: number; inputTokens: number; outputTokens: number }
  range: TimeRange
  x: number
  containerRef: React.RefObject<HTMLDivElement | null>
}) {
  const containerWidth = containerRef.current?.clientWidth ?? 600
  const tooltipW = 160
  const adjustedX = x + tooltipW > containerWidth ? x - tooltipW - 8 : x + 8

  return (
    <div
      className="absolute pointer-events-none bg-popover border rounded-lg shadow-lg p-2.5 text-xs z-50"
      style={{
        left: adjustedX,
        top: CHART_PADDING.top + 4,
        width: tooltipW,
      }}
    >
      <p className="font-medium mb-1.5">
        {formatTimeLabel(bucket.timestamp, range)}
      </p>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span style={{ color: INPUT_COLOR }}>● Input</span>
          <span className="font-medium">{formatTokens(bucket.inputTokens)}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: OUTPUT_COLOR }}>● Output</span>
          <span className="font-medium">{formatTokens(bucket.outputTokens)}</span>
        </div>
        <div className="flex justify-between border-t pt-1 mt-1">
          <span>Total</span>
          <span className="font-semibold">
            {formatTokens(bucket.inputTokens + bucket.outputTokens)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Per-model breakdown sub-component
// ---------------------------------------------------------------------------

function ModelBreakdown({
  data,
  rangeMs,
}: {
  data: TokenDataPoint[]
  rangeMs: number
}) {
  const models = useMemo(() => {
    const now = Date.now()
    const start = now - rangeMs
    const filtered = data.filter(
      (d) => d.timestamp >= start && d.timestamp <= now && d.model,
    )
    if (filtered.length === 0) return []

    const map = new Map<
      string,
      { model: string; input: number; output: number; count: number }
    >()
    for (const d of filtered) {
      const key = d.model!
      const entry = map.get(key) ?? { model: key, input: 0, output: 0, count: 0 }
      entry.input += d.inputTokens
      entry.output += d.outputTokens
      entry.count += 1
      map.set(key, entry)
    }

    return Array.from(map.values()).sort(
      (a, b) => b.input + b.output - (a.input + a.output),
    )
  }, [data, rangeMs])

  if (models.length <= 1) return null

  const maxTotal = Math.max(...models.map((m) => m.input + m.output), 1)

  return (
    <div className="border-t pt-4 space-y-2">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        By Model
      </h4>
      {models.map((m) => {
        const total = m.input + m.output
        const pct = (total / maxTotal) * 100
        const inputPct = total > 0 ? (m.input / total) * 100 : 50
        return (
          <div key={m.model} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium truncate max-w-[60%]">{m.model}</span>
              <span className="text-muted-foreground">
                {formatTokens(total)} · {m.count} calls
              </span>
            </div>
            <div
              className="h-2.5 rounded-full overflow-hidden bg-muted"
              style={{ width: `${pct}%`, minWidth: 16 }}
            >
              <div className="h-full flex">
                <div
                  className="h-full"
                  style={{
                    width: `${inputPct}%`,
                    backgroundColor: INPUT_COLOR,
                  }}
                />
                <div
                  className="h-full"
                  style={{
                    width: `${100 - inputPct}%`,
                    backgroundColor: OUTPUT_COLOR,
                  }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

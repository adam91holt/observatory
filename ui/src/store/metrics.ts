/**
 * Metrics Store — Real-time metric tracking
 *
 * Aggregates live metrics from Gateway events: token counts, message rates,
 * model usage, and cost tracking. Uses a sliding window for rate calculations
 * and deduplicates events by ID.
 *
 * Issue: #17 Real-Time Updates
 */

import { create } from 'zustand'

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export interface TokenMetrics {
  totalIn: number
  totalOut: number
  /** Tokens per minute (sliding window) */
  rateIn: number
  rateOut: number
}

export interface MessageMetrics {
  totalInbound: number
  totalOutbound: number
  /** Messages per minute (sliding window) */
  rateInbound: number
  rateOutbound: number
}

export interface ModelUsageEntry {
  model: string
  calls: number
  tokensIn: number
  tokensOut: number
  costUsd: number
  lastUsedAt: number
}

export interface CostMetrics {
  totalUsd: number
  /** Rolling cost in the last hour */
  hourlyUsd: number
  byModel: Map<string, number>
}

/** A single timestamped data point for rate calculations */
interface RatePoint {
  timestamp: number
  value: number
}

// ---------------------------------------------------------------------------
//  State shape
// ---------------------------------------------------------------------------

export interface MetricsState {
  tokens: TokenMetrics
  messages: MessageMetrics
  cost: CostMetrics
  modelUsage: Map<string, ModelUsageEntry>

  /** Set of processed event IDs for deduplication */
  processedEventIds: Set<string>
  /** Max size before pruning old event IDs */
  maxProcessedIds: number

  /** Last update timestamp */
  lastUpdateAt: number

  // Internal rate tracking (not exposed to components)
  _tokenInPoints: RatePoint[]
  _tokenOutPoints: RatePoint[]
  _msgInPoints: RatePoint[]
  _msgOutPoints: RatePoint[]
  _costPoints: RatePoint[]

  // Actions
  /** Record token usage from an agent lifecycle event */
  recordTokens: (tokensIn: number, tokensOut: number, eventId?: string) => void
  /** Record a message (inbound or outbound) */
  recordMessage: (direction: 'inbound' | 'outbound', eventId?: string) => void
  /** Record model usage (cost + tokens) */
  recordModelUsage: (
    model: string,
    tokensIn: number,
    tokensOut: number,
    costUsd: number,
    eventId?: string,
  ) => void
  /** Bulk-set metrics from a snapshot/REST response */
  setSnapshot: (snapshot: MetricsSnapshot) => void
  /** Recalculate rates (call periodically) */
  recalculateRates: () => void
  /** Check if an event ID has already been processed */
  isDuplicate: (eventId?: string) => boolean
  /** Reset store */
  reset: () => void
}

/** Shape for bulk-loading metrics from REST API */
export interface MetricsSnapshot {
  tokens?: { totalIn: number; totalOut: number }
  messages?: { totalInbound: number; totalOutbound: number }
  cost?: { totalUsd: number }
  modelUsage?: Array<{
    model: string
    calls: number
    tokensIn: number
    tokensOut: number
    costUsd: number
  }>
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

/** Sliding window for rate calculations (60 seconds) */
const RATE_WINDOW_MS = 60_000
/** Maximum number of rate data points to keep */
const MAX_RATE_POINTS = 300
/** Max processed IDs before we prune the oldest half */
const DEFAULT_MAX_PROCESSED_IDS = 5000

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function calcRate(points: RatePoint[], windowMs: number): number {
  const cutoff = Date.now() - windowMs
  const recent = points.filter((p) => p.timestamp >= cutoff)
  const sum = recent.reduce((acc, p) => acc + p.value, 0)
  // Return per-minute rate
  return Math.round((sum / (windowMs / 60_000)) * 100) / 100
}

function trimPoints(points: RatePoint[], max: number): RatePoint[] {
  if (points.length <= max) return points
  return points.slice(-max)
}

function pruneProcessedIds(ids: Set<string>, maxSize: number): Set<string> {
  if (ids.size <= maxSize) return ids
  // Keep the most recent half — Set iterates in insertion order
  const arr = Array.from(ids)
  return new Set(arr.slice(arr.length - Math.floor(maxSize / 2)))
}

// ---------------------------------------------------------------------------
//  Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  tokens: { totalIn: 0, totalOut: 0, rateIn: 0, rateOut: 0 },
  messages: { totalInbound: 0, totalOutbound: 0, rateInbound: 0, rateOutbound: 0 },
  cost: { totalUsd: 0, hourlyUsd: 0, byModel: new Map<string, number>() },
  modelUsage: new Map<string, ModelUsageEntry>(),
  processedEventIds: new Set<string>(),
  maxProcessedIds: DEFAULT_MAX_PROCESSED_IDS,
  lastUpdateAt: 0,
  _tokenInPoints: [] as RatePoint[],
  _tokenOutPoints: [] as RatePoint[],
  _msgInPoints: [] as RatePoint[],
  _msgOutPoints: [] as RatePoint[],
  _costPoints: [] as RatePoint[],
}

// ---------------------------------------------------------------------------
//  Store
// ---------------------------------------------------------------------------

export const useMetricsStore = create<MetricsState>((set, get) => ({
  ...INITIAL_STATE,

  recordTokens: (tokensIn, tokensOut, eventId) => {
    if (get().isDuplicate(eventId)) return

    const now = Date.now()
    set((state) => {
      const processedEventIds = new Set(state.processedEventIds)
      if (eventId) processedEventIds.add(eventId)

      return {
        tokens: {
          totalIn: state.tokens.totalIn + tokensIn,
          totalOut: state.tokens.totalOut + tokensOut,
          rateIn: state.tokens.rateIn,
          rateOut: state.tokens.rateOut,
        },
        _tokenInPoints: trimPoints(
          [...state._tokenInPoints, { timestamp: now, value: tokensIn }],
          MAX_RATE_POINTS,
        ),
        _tokenOutPoints: trimPoints(
          [...state._tokenOutPoints, { timestamp: now, value: tokensOut }],
          MAX_RATE_POINTS,
        ),
        processedEventIds: pruneProcessedIds(processedEventIds, state.maxProcessedIds),
        lastUpdateAt: now,
      }
    })
  },

  recordMessage: (direction, eventId) => {
    if (get().isDuplicate(eventId)) return

    const now = Date.now()
    set((state) => {
      const processedEventIds = new Set(state.processedEventIds)
      if (eventId) processedEventIds.add(eventId)

      const isInbound = direction === 'inbound'
      return {
        messages: {
          totalInbound: state.messages.totalInbound + (isInbound ? 1 : 0),
          totalOutbound: state.messages.totalOutbound + (isInbound ? 0 : 1),
          rateInbound: state.messages.rateInbound,
          rateOutbound: state.messages.rateOutbound,
        },
        _msgInPoints: isInbound
          ? trimPoints([...state._msgInPoints, { timestamp: now, value: 1 }], MAX_RATE_POINTS)
          : state._msgInPoints,
        _msgOutPoints: isInbound
          ? state._msgOutPoints
          : trimPoints([...state._msgOutPoints, { timestamp: now, value: 1 }], MAX_RATE_POINTS),
        processedEventIds: pruneProcessedIds(processedEventIds, state.maxProcessedIds),
        lastUpdateAt: now,
      }
    })
  },

  recordModelUsage: (model, tokensIn, tokensOut, costUsd, eventId) => {
    if (get().isDuplicate(eventId)) return

    const now = Date.now()
    set((state) => {
      const processedEventIds = new Set(state.processedEventIds)
      if (eventId) processedEventIds.add(eventId)

      const modelUsage = new Map(state.modelUsage)
      const existing = modelUsage.get(model)
      modelUsage.set(model, {
        model,
        calls: (existing?.calls ?? 0) + 1,
        tokensIn: (existing?.tokensIn ?? 0) + tokensIn,
        tokensOut: (existing?.tokensOut ?? 0) + tokensOut,
        costUsd: (existing?.costUsd ?? 0) + costUsd,
        lastUsedAt: now,
      })

      const byModel = new Map(state.cost.byModel)
      byModel.set(model, (byModel.get(model) ?? 0) + costUsd)

      return {
        tokens: {
          totalIn: state.tokens.totalIn + tokensIn,
          totalOut: state.tokens.totalOut + tokensOut,
          rateIn: state.tokens.rateIn,
          rateOut: state.tokens.rateOut,
        },
        cost: {
          totalUsd: state.cost.totalUsd + costUsd,
          hourlyUsd: state.cost.hourlyUsd,
          byModel,
        },
        modelUsage,
        _tokenInPoints: trimPoints(
          [...state._tokenInPoints, { timestamp: now, value: tokensIn }],
          MAX_RATE_POINTS,
        ),
        _tokenOutPoints: trimPoints(
          [...state._tokenOutPoints, { timestamp: now, value: tokensOut }],
          MAX_RATE_POINTS,
        ),
        _costPoints: trimPoints(
          [...state._costPoints, { timestamp: now, value: costUsd }],
          MAX_RATE_POINTS,
        ),
        processedEventIds: pruneProcessedIds(processedEventIds, state.maxProcessedIds),
        lastUpdateAt: now,
      }
    })
  },

  setSnapshot: (snapshot) => {
    set((state) => ({
      tokens: {
        ...state.tokens,
        totalIn: snapshot.tokens?.totalIn ?? state.tokens.totalIn,
        totalOut: snapshot.tokens?.totalOut ?? state.tokens.totalOut,
      },
      messages: {
        ...state.messages,
        totalInbound: snapshot.messages?.totalInbound ?? state.messages.totalInbound,
        totalOutbound: snapshot.messages?.totalOutbound ?? state.messages.totalOutbound,
      },
      cost: {
        ...state.cost,
        totalUsd: snapshot.cost?.totalUsd ?? state.cost.totalUsd,
      },
      modelUsage: snapshot.modelUsage
        ? new Map(
            snapshot.modelUsage.map((m) => [
              m.model,
              { ...m, lastUsedAt: Date.now() },
            ]),
          )
        : state.modelUsage,
      lastUpdateAt: Date.now(),
    }))
  },

  recalculateRates: () => {
    set((state) => ({
      tokens: {
        ...state.tokens,
        rateIn: calcRate(state._tokenInPoints, RATE_WINDOW_MS),
        rateOut: calcRate(state._tokenOutPoints, RATE_WINDOW_MS),
      },
      messages: {
        ...state.messages,
        rateInbound: calcRate(state._msgInPoints, RATE_WINDOW_MS),
        rateOutbound: calcRate(state._msgOutPoints, RATE_WINDOW_MS),
      },
      cost: {
        ...state.cost,
        hourlyUsd:
          calcRate(state._costPoints, RATE_WINDOW_MS) * 60, // extrapolate to hourly
      },
    }))
  },

  isDuplicate: (eventId) => {
    if (!eventId) return false
    return get().processedEventIds.has(eventId)
  },

  reset: () => set(INITIAL_STATE),
}))

// ---------------------------------------------------------------------------
//  Selectors
// ---------------------------------------------------------------------------

/** Get token totals and rates */
export function useTokenMetrics(): TokenMetrics {
  return useMetricsStore((state) => state.tokens)
}

/** Get message totals and rates */
export function useMessageMetrics(): MessageMetrics {
  return useMetricsStore((state) => state.messages)
}

/** Get cost metrics */
export function useCostMetrics(): CostMetrics {
  return useMetricsStore((state) => state.cost)
}

/** Get model usage as sorted array */
export function useModelUsageList(): ModelUsageEntry[] {
  return useMetricsStore((state) =>
    Array.from(state.modelUsage.values()).sort((a, b) => b.calls - a.calls),
  )
}

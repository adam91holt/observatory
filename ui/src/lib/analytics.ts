/**
 * Analytics processing functions for Observatory dashboard
 * Processes session JSONL data to generate cost breakdown, token usage, and activity metrics
 */

export interface AgentCostData {
  agentId: string
  cost: number
  tokens: number
  sessions: number
  models: Set<string>
}

export interface DayCostData {
  date: string
  cost: number
  tokens: number
  sessions: number
  agentCount: number
}

export interface HourActivityData {
  hour: string
  sessions: number
  messages: number
  cost: number
}

/**
 * Process raw session data to generate cost breakdown by agent
 */
export function processCostByAgent(
  sessions: Array<{
    agentId: string
    updatedAt: string | number
    cost?: number
    tokens?: number
  }>
): AgentCostData[] {
  const agentMap = new Map<string, AgentCostData>()

  for (const session of sessions) {
    if (!session.agentId) continue

    const key = session.agentId
    if (!agentMap.has(key)) {
      agentMap.set(key, {
        agentId: key,
        cost: 0,
        tokens: 0,
        sessions: 0,
        models: new Set(),
      })
    }

    const agent = agentMap.get(key)!
    agent.cost += session.cost || 0
    agent.tokens += session.tokens || 0
    agent.sessions += 1
  }

  return Array.from(agentMap.values()).map((agent) => ({
    ...agent,
    models: agent.models, // Keep as is or convert to array if needed
  }))
}

/**
 * Process raw session data to generate cost breakdown by day
 */
export function processCostByDay(
  sessions: Array<{
    agentId: string
    updatedAt: string | number
    cost?: number
    tokens?: number
  }>
): DayCostData[] {
  const dayMap = new Map<string, DayCostData>()

  for (const session of sessions) {
    if (!session.updatedAt) continue

    const date = new Date(session.updatedAt)
    const dateKey = date.toISOString().split("T")[0] // YYYY-MM-DD

    if (!dayMap.has(dateKey)) {
      dayMap.set(dateKey, {
        date: dateKey,
        cost: 0,
        tokens: 0,
        sessions: 0,
        agentCount: 0,
      })
    }

    const day = dayMap.get(dateKey)!
    day.cost += session.cost || 0
    day.tokens += session.tokens || 0
    day.sessions += 1
  }

  return Array.from(dayMap.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
}

/**
 * Process raw session data to generate activity metrics (sessions per hour)
 */
export function processHourlyActivity(
  sessions: Array<{
    agentId: string
    updatedAt: string | number
    cost?: number
    messages?: number
  }>
): HourActivityData[] {
  const hourMap = new Map<string, HourActivityData>()

  for (const session of sessions) {
    if (!session.updatedAt) continue

    const date = new Date(session.updatedAt)
    const hour = date.toISOString().substring(11, 13) // HH in 24h format
    const hourStr = `${hour}:00`

    if (!hourMap.has(hourStr)) {
      hourMap.set(hourStr, {
        hour: hourStr,
        sessions: 0,
        messages: 0,
        cost: 0,
      })
    }

    const hourData = hourMap.get(hourStr)!
    hourData.sessions += 1
    hourData.messages += session.messages || 1
    hourData.cost += session.cost || 0
  }

  // Ensure all 24 hours are represented
  const result: HourActivityData[] = []
  for (let i = 0; i < 24; i++) {
    const hourStr = `${String(i).padStart(2, "0")}:00`
    result.push(hourMap.get(hourStr) || {
      hour: hourStr,
      sessions: 0,
      messages: 0,
      cost: 0,
    })
  }

  return result
}

/**
 * Calculate token distribution statistics
 */
export function calculateTokenDistribution(
  sessions: Array<{
    inputTokens?: number
    outputTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }>
) {
  let totalInput = 0
  let totalOutput = 0
  let totalCacheRead = 0
  let totalCacheWrite = 0

  for (const session of sessions) {
    totalInput += session.inputTokens || 0
    totalOutput += session.outputTokens || 0
    totalCacheRead += session.cacheReadTokens || 0
    totalCacheWrite += session.cacheWriteTokens || 0
  }

  const totalTokens = totalInput + totalOutput
  const cacheHitRatio = (totalCacheRead + totalCacheWrite) > 0
    ? totalCacheRead / (totalCacheRead + totalCacheWrite)
    : 0

  return {
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheReadTokens: totalCacheRead,
    cacheWriteTokens: totalCacheWrite,
    totalTokens,
    cacheHitRatio,
  }
}

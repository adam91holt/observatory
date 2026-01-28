import type {
  AgentsResponse,
  ChannelsResponse,
  SessionsResponse,
  TranscriptResponse,
  RunsResponse,
  StatsResponse,
  AnalyticsResponse,
} from "@/types"

const API_BASE = "/observatory/api"

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`)
  if (!response.ok) {
    throw new Error(`API error: ${response.statusText}`)
  }
  return response.json()
}

export async function getAgents(): Promise<AgentsResponse> {
  return fetchApi<AgentsResponse>("/agents")
}

export async function getChannels(): Promise<ChannelsResponse> {
  return fetchApi<ChannelsResponse>("/channels")
}

export async function getSessions(): Promise<SessionsResponse> {
  return fetchApi<SessionsResponse>("/sessions")
}

export async function getTranscript(
  agentId: string,
  sessionId: string
): Promise<TranscriptResponse> {
  return fetchApi<TranscriptResponse>(
    `/transcript?agentId=${encodeURIComponent(agentId)}&sessionId=${encodeURIComponent(sessionId)}`
  )
}

export async function getTranscriptByKey(
  sessionKey: string
): Promise<TranscriptResponse> {
  return fetchApi<TranscriptResponse>(
    `/transcript?sessionKey=${encodeURIComponent(sessionKey)}`
  )
}

export async function getRuns(): Promise<RunsResponse> {
  return fetchApi<RunsResponse>("/runs")
}

export async function getStats(): Promise<StatsResponse> {
  return fetchApi<StatsResponse>("/stats")
}

export async function getAnalytics(range: string = "all"): Promise<AnalyticsResponse> {
  return fetchApi<AnalyticsResponse>(`/analytics?range=${encodeURIComponent(range)}`)
}

export async function getConfig(): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>("/config")
}

// SSE connection for live events
export function subscribeToEvents(
  onEvent: (event: string) => void,
  onError?: (error: Event) => void
): () => void {
  const eventSource = new EventSource("/observatory/events")

  eventSource.onmessage = (event) => {
    onEvent(event.data)
  }

  eventSource.onerror = (error) => {
    onError?.(error)
  }

  return () => eventSource.close()
}

// Event API endpoints
export async function getAgentEvents(params?: {
  runId?: string
  sessionKey?: string
  stream?: string
  since?: number
  limit?: number
}): Promise<any> {
  const query = new URLSearchParams()
  if (params?.runId) query.set('runId', params.runId)
  if (params?.sessionKey) query.set('sessionKey', params.sessionKey)
  if (params?.stream) query.set('stream', params.stream)
  if (params?.since) query.set('since', params.since.toString())
  if (params?.limit) query.set('limit', params.limit.toString())

  return fetchApi(`/events/agent?${query.toString()}`)
}

export async function getDiagnosticEvents(params?: {
  type?: string
  sessionKey?: string
  channel?: string
  since?: number
  limit?: number
}): Promise<any> {
  const query = new URLSearchParams()
  if (params?.type) query.set('type', params.type)
  if (params?.sessionKey) query.set('sessionKey', params.sessionKey)
  if (params?.channel) query.set('channel', params.channel)
  if (params?.since) query.set('since', params.since.toString())
  if (params?.limit) query.set('limit', params.limit.toString())

  return fetchApi(`/events/diagnostics?${query.toString()}`)
}

export async function getHeartbeatEvents(params?: {
  status?: string
  channel?: string
  since?: number
  limit?: number
}): Promise<any> {
  const query = new URLSearchParams()
  if (params?.status) query.set('status', params.status)
  if (params?.channel) query.set('channel', params.channel)
  if (params?.since) query.set('since', params.since.toString())
  if (params?.limit) query.set('limit', params.limit.toString())

  return fetchApi(`/events/heartbeats?${query.toString()}`)
}

export async function getRunTimeline(runId: string): Promise<any> {
  return fetchApi(`/runs/${encodeURIComponent(runId)}/timeline`)
}

export async function getDiagnosticsSummary(): Promise<any> {
  return fetchApi('/diagnostics/summary')
}

export async function getHeartbeatHealth(): Promise<any> {
  return fetchApi('/heartbeats/health')
}

export async function getHooks(params?: {
  hookName?: string
  sessionKey?: string
  since?: number
  limit?: number
}): Promise<any> {
  const query = new URLSearchParams()
  if (params?.hookName) query.set('hookName', params.hookName)
  if (params?.sessionKey) query.set('sessionKey', params.sessionKey)
  if (params?.since) query.set('since', params.since.toString())
  if (params?.limit) query.set('limit', params.limit.toString())

  return fetchApi(`/hooks?${query.toString()}`)
}

export async function getMetricsHistory(limit?: number): Promise<any> {
  const query = limit ? `?limit=${limit}` : ''
  return fetchApi(`/metrics/history${query}`)
}

export async function getLatestMetrics(): Promise<any> {
  return fetchApi('/metrics/latest')
}

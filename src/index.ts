import type { MoltbotPluginApi, MoltbotPluginHttpHandler } from 'clawdbot/plugin-sdk';
import { Tail } from 'tail';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
import { onDiagnosticEvent } from 'clawdbot/plugin-sdk';
import { AgentEventStore } from './event-store.js';
import { DiagnosticsStore } from './diagnostics-store.js';
import { HeartbeatTracker } from './heartbeat-tracker.js';
import { HooksStore } from './hooks-store.js';
import { createObservatoryQueryTool } from './tools/query-tool.js';
import { ObservatoryService } from './service.js';

export const id = 'observatory';

export const configSchema = {
  validate: () => ({ ok: true as const }),
  jsonSchema: {
    type: 'object',
    properties: {
      retention: {
        type: 'object',
        properties: {
          events: { type: 'string', default: '7d' },
          metrics: { type: 'string', default: '30d' },
        },
      },
      capture: {
        type: 'object',
        properties: {
          diagnostics: { type: 'boolean', default: true },
          heartbeats: { type: 'boolean', default: true },
          agentEvents: { type: 'boolean', default: true },
        },
      },
    },
    additionalProperties: false,
  },
};

// Resolve the UI dist directory relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIST = path.resolve(__dirname, '../ui/dist');

interface SessionRegistryEntry {
  sessionId: string;
  updatedAt: number;
  systemSent?: boolean;
  sessionFile?: string;
  [key: string]: any;
}

interface AgentSessionSummary {
  agentId: string;
  sessionKey: string;
  sessionId: string;
  updatedAt: number;
  displayName?: string;
  chatType?: string;
  archived?: boolean;
  archivedAt?: number;
  archiveReason?: string;
}

export function register(api: MoltbotPluginApi) {
  api.logger.info('🔭 Observatory API initializing...');

  // --- Event Stores ---
  const agentEventStore = new AgentEventStore({ maxEvents: 1000, maxAge: 24 * 60 * 60 * 1000 });
  const diagnosticsStore = new DiagnosticsStore({ maxEvents: 1000, maxAge: 24 * 60 * 60 * 1000 });
  const heartbeatTracker = new HeartbeatTracker({ maxEvents: 100, maxAge: 7 * 24 * 60 * 60 * 1000 });
  const hooksStore = new HooksStore({ maxEvents: 500, maxAge: 24 * 60 * 60 * 1000 });

  // --- Event Subscriptions ---
  const pluginConfig = api.pluginConfig as any;
  const captureAgentEvents = pluginConfig?.capture?.agentEvents !== false;
  const captureDiagnostics = pluginConfig?.capture?.diagnostics !== false;
  const captureHeartbeats = pluginConfig?.capture?.heartbeats !== false;

  // Get event subscription functions from runtime
  const eventsApi = (api.runtime as any).events;

  // Subscribe to agent events
  if (captureAgentEvents && eventsApi?.onAgentEvent) {
    const unsubscribeAgent = eventsApi.onAgentEvent((event: any) => {
      try {
        const id = agentEventStore.add(event);
        // Broadcast to live feed
        broadcastEvent('agent', { ...event, id });
      } catch (err) {
        api.logger.warn?.(`[observatory] Failed to store agent event: ${err}`);
      }
    });
    api.logger.info('🔭 Observatory: subscribed to agent events');
  } else if (captureAgentEvents) {
    api.logger.warn('🔭 Observatory: onAgentEvent not available in runtime');
  }

  // Subscribe to diagnostic events
  if (captureDiagnostics) {
    const unsubscribeDiagnostic = onDiagnosticEvent((event) => {
      try {
        const id = diagnosticsStore.add(event);
        // Broadcast to live feed
        broadcastEvent('diagnostic', { ...event, id });
      } catch (err) {
        api.logger.warn?.(`[observatory] Failed to store diagnostic event: ${err}`);
      }
    });
    api.logger.info('🔭 Observatory: subscribed to diagnostic events');
  }

  // Subscribe to heartbeat events
  if (captureHeartbeats && eventsApi?.onHeartbeatEvent) {
    const unsubscribeHeartbeat = eventsApi.onHeartbeatEvent((event: any) => {
      try {
        const id = heartbeatTracker.add(event);
        // Broadcast to live feed
        broadcastEvent('heartbeat', { ...event, id });
      } catch (err) {
        api.logger.warn?.(`[observatory] Failed to store heartbeat event: ${err}`);
      }
    });
    api.logger.info('🔭 Observatory: subscribed to heartbeat events');
  } else if (captureHeartbeats) {
    api.logger.warn('🔭 Observatory: onHeartbeatEvent not available in runtime');
  }

  // --- Lifecycle Hooks ---
  // Register lifecycle hooks to capture key events

  // before_agent_start hook
  api.on('before_agent_start', async (event, ctx) => {
    try {
      const id = hooksStore.add('before_agent_start', ctx as any, event as any);
      // Broadcast to live feed
      broadcastEvent('hook', { hookName: 'before_agent_start', context: ctx, event, id });
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store before_agent_start hook: ${err}`);
    }
  });

  // agent_end hook
  api.on('agent_end', async (event, ctx) => {
    try {
      hooksStore.add('agent_end', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store agent_end hook: ${err}`);
    }
  });

  // session_start hook
  api.on('session_start', async (event, ctx) => {
    try {
      hooksStore.add('session_start', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store session_start hook: ${err}`);
    }
  });

  // session_end hook
  api.on('session_end', async (event, ctx) => {
    try {
      hooksStore.add('session_end', ctx as any, event as any);

      // CRITICAL: Mark session as completed in all stores to preserve full session history
      if ((ctx as any).sessionKey) {
        const sessionKey = (ctx as any).sessionKey;
        agentEventStore.markSessionCompleted(sessionKey);
        diagnosticsStore.markSessionCompleted(sessionKey);
        hooksStore.markSessionCompleted(sessionKey);
        api.logger.debug?.(`🔭 Observatory: marked session ${sessionKey} as completed`);
      }
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store session_end hook: ${err}`);
    }
  });

  // message_received hook
  api.on('message_received', async (event, ctx) => {
    try {
      hooksStore.add('message_received', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store message_received hook: ${err}`);
    }
  });

  // message_sending hook
  api.on('message_sending', async (event, ctx) => {
    try {
      hooksStore.add('message_sending', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store message_sending hook: ${err}`);
    }
  });

  // message_sent hook
  api.on('message_sent', async (event, ctx) => {
    try {
      hooksStore.add('message_sent', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store message_sent hook: ${err}`);
    }
  });

  // before_tool_call hook
  api.on('before_tool_call', async (event, ctx) => {
    try {
      hooksStore.add('before_tool_call', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store before_tool_call hook: ${err}`);
    }
  });

  // after_tool_call hook
  api.on('after_tool_call', async (event, ctx) => {
    try {
      hooksStore.add('after_tool_call', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store after_tool_call hook: ${err}`);
    }
  });

  // tool_result_persist hook (synchronous)
  api.on('tool_result_persist', (event, ctx) => {
    try {
      hooksStore.add('tool_result_persist', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store tool_result_persist hook: ${err}`);
    }
  });

  // gateway_start hook
  api.on('gateway_start', async (event, ctx) => {
    try {
      hooksStore.add('gateway_start', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store gateway_start hook: ${err}`);
    }
  });

  // gateway_stop hook
  api.on('gateway_stop', async (event, ctx) => {
    try {
      hooksStore.add('gateway_stop', ctx as any, event as any);
    } catch (err) {
      api.logger.warn?.(`[observatory] Failed to store gateway_stop hook: ${err}`);
    }
  });

  api.logger.debug?.('🔭 Observatory: registered lifecycle hooks');

  // --- Agent Tool Registration ---
  // Register a tool that allows agents to query Observatory data
  const observatoryTool = createObservatoryQueryTool({
    agentEventStore,
    diagnosticsStore,
    heartbeatTracker,
    hooksStore,
  });

  api.registerTool(observatoryTool, { optional: true });
  api.logger.debug?.('🔭 Observatory: registered agent tool');

  // --- Background Service Registration ---
  // Create and register background service for metrics aggregation
  let observatoryService: ObservatoryService | null = null;

  api.registerService({
    id: 'observatory-aggregator',
    start: async (ctx) => {
      observatoryService = new ObservatoryService(ctx, {
        agentEventStore,
        diagnosticsStore,
        heartbeatTracker,
        hooksStore,
      });
      await observatoryService.start();
    },
    stop: async (ctx) => {
      if (observatoryService) {
        await observatoryService.stop();
        observatoryService = null;
      }
    },
  });

  api.logger.debug?.('🔭 Observatory: registered background service');

  // --- Cache for stats (60s TTL) ---
  let statsCache: { stats: any; timestamp: number } | null = null;
  const STATS_CACHE_TTL = 60000; // 60 seconds

  // --- Log Tailing (Live Firehose) ---
  const connections = new Set<(line: string) => void>();
  let tail: Tail | null = null;
  let tailRetry: NodeJS.Timeout | null = null;

  // Broadcast events to connected clients
  const broadcastEvent = (eventType: string, data: any) => {
    const message = JSON.stringify({ type: eventType, data, ts: Date.now() });
    for (const send of connections) {
      try {
        send(message);
      } catch (err) {
        // Ignore send errors
      }
    }
  };

  const clearTailRetry = () => {
    if (!tailRetry) return;
    clearTimeout(tailRetry);
    tailRetry = null;
  };

  const stopTail = () => {
    clearTailRetry();
    if (!tail) return;
    tail.unwatch();
    tail = null;
  };

  const scheduleTailRetry = () => {
    if (tailRetry || connections.size === 0) return;
    tailRetry = setTimeout(() => {
      tailRetry = null;
      setupTail();
    }, 5000);
    tailRetry.unref?.();
  };

  const setupTail = () => {
    if (tail || connections.size === 0) return;
    let logFile = api.config.logging?.file;
    if (!logFile) {
      const date = new Date().toISOString().split('T')[0];
      logFile = `/tmp/clawdbot/clawdbot-${date}.log`;
    }

    if (!fs.existsSync(logFile)) {
      scheduleTailRetry();
      return;
    }

    tail = new Tail(logFile);
    tail.on('line', (data: string) => {
      for (const send of connections) send(data);
    });
    tail.on('error', () => {
      tail?.unwatch();
      tail = null;
      scheduleTailRetry();
    });
  };

  // --- Helpers ---

  const sendJson = (res: ServerResponse, data: any, status = 200) => {
    res.writeHead(status, { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*' 
    });
    res.end(JSON.stringify(data, null, 2));
  };

  const sendError = (res: ServerResponse, message: string, status = 500) => {
    sendJson(res, { error: message }, status);
  };

  const resolveSessionRoots = (agent: any): string[] => {
    const roots = new Set<string>();
    if (agent?.agentDir) {
      roots.add(path.join(agent.agentDir, 'sessions'));
    }
    roots.add(path.join(os.homedir(), `.clawdbot/agents/${agent.id}/sessions`));
    if (agent?.workspace) {
      roots.add(path.join(agent.workspace, 'sessions'));
    }
    return [...roots];
  };

  const parseArchivedTimestamp = (raw: string): number | null => {
    if (!raw) return null;
    const normalized = raw.replace(/T(\d{2})-(\d{2})-(\d{2})/, 'T$1:$2:$3');
    const parsed = Date.parse(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseArchivedFile = (fileName: string): { sessionId: string; reason: string; ts?: string } | null => {
    const match = fileName.match(/^(.+)\.jsonl\.([^.]+)\.(.+)$/);
    if (!match) return null;
    return { sessionId: match[1], reason: match[2], ts: match[3] };
  };

  const listArchivedTranscripts = async (roots: string[]) => {
    const archivedBySession = new Map<string, {
      sessionId: string;
      filePath: string;
      archivedAt: number;
      updatedAt: number;
      reason: string;
    }>();
    const seenPaths = new Set<string>();

    for (const root of roots) {
      let entries: string[] = [];
      try {
        entries = await fs.promises.readdir(root);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.includes('.jsonl.')) continue;
        const parsed = parseArchivedFile(entry);
        if (!parsed || parsed.reason !== 'deleted') continue;
        const filePath = path.join(root, entry);
        if (seenPaths.has(filePath)) continue;
        let stat: fs.Stats;
        try {
          stat = await fs.promises.stat(filePath);
        } catch {
          continue;
        }
        const parsedTs = parsed.ts ? parseArchivedTimestamp(parsed.ts) : null;
        const archivedAt = parsedTs ?? stat.mtimeMs;
        const next = {
          sessionId: parsed.sessionId,
          filePath,
          archivedAt,
          updatedAt: archivedAt,
          reason: parsed.reason,
        };
        const existing = archivedBySession.get(parsed.sessionId);
        if (!existing || archivedAt > existing.archivedAt) {
          archivedBySession.set(parsed.sessionId, next);
        }
        seenPaths.add(filePath);
      }
    }

    return [...archivedBySession.values()];
  };

  const loadSessionStoreForAgent = async (agent: any) => {
    const roots = resolveSessionRoots(agent);
    for (const root of roots) {
      const sessionFile = path.join(root, 'sessions.json');
      try {
        await fs.promises.access(sessionFile);
        const content = await fs.promises.readFile(sessionFile, 'utf-8');
        const sessions = JSON.parse(content);
        return { storePath: sessionFile, sessions, roots };
      } catch (e: any) {
        if (e.code !== 'ENOENT') {
          api.logger.warn(`[observatory] Failed to read sessions for ${agent.id}: ${e}`);
        }
      }
    }
    return { storePath: undefined, sessions: null, roots };
  };

  const resolveTranscriptPath = async (params: {
    sessionId: string;
    roots: string[];
    sessionFile?: string;
  }) => {
    const candidates: string[] = [];
    if (params.sessionFile) candidates.push(params.sessionFile);
    for (const root of params.roots) {
      candidates.push(path.join(root, `${params.sessionId}.jsonl`));
    }
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return { path: candidate, archived: false };
      }
    }

    let bestArchived: { path: string; archivedAt: number; reason: string } | null = null;
    for (const root of params.roots) {
      let entries: string[] = [];
      try {
        entries = await fs.promises.readdir(root);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.startsWith(`${params.sessionId}.jsonl.`)) continue;
        const parsed = parseArchivedFile(entry);
        if (!parsed || parsed.reason !== 'deleted') continue;
        const filePath = path.join(root, entry);
        let stat: fs.Stats;
        try {
          stat = await fs.promises.stat(filePath);
        } catch {
          continue;
        }
        const parsedTs = parsed.ts ? parseArchivedTimestamp(parsed.ts) : null;
        const archivedAt = parsedTs ?? stat.mtimeMs;
        if (!bestArchived || archivedAt > bestArchived.archivedAt) {
          bestArchived = { path: filePath, archivedAt, reason: parsed.reason };
        }
      }
    }

    if (bestArchived) {
      return { path: bestArchived.path, archived: true, archivedAt: bestArchived.archivedAt };
    }
    return null;
  };

  const forEachTranscriptEntry = async (
    filePath: string,
    onEntry: (entry: any) => void,
  ) => {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        onEntry(entry);
      } catch {
        // Skip invalid lines
      }
    }
  };

  // --- HTTP Handler ---
  const handler: MoltbotPluginHttpHandler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', 'http://localhost');

    // CORS Preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return true;
    }

    // === NEW EVENT API ENDPOINTS ===

    // GET /observatory/api/events/agent - Query agent events
    if (url.pathname === '/observatory/api/events/agent') {
      const runId = url.searchParams.get('runId');
      const sessionKey = url.searchParams.get('sessionKey');
      const stream = url.searchParams.get('stream');
      const since = url.searchParams.get('since');
      const limit = url.searchParams.get('limit');

      const events = agentEventStore.query({
        runId: runId ?? undefined,
        sessionKey: sessionKey ?? undefined,
        stream: stream ?? undefined,
        since: since ? parseInt(since, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : 100,
      });

      sendJson(res, { events, stats: agentEventStore.getStats() });
      return true;
    }

    // GET /observatory/api/events/diagnostics - Query diagnostic events
    if (url.pathname === '/observatory/api/events/diagnostics') {
      const type = url.searchParams.get('type');
      const sessionKey = url.searchParams.get('sessionKey');
      const channel = url.searchParams.get('channel');
      const since = url.searchParams.get('since');
      const limit = url.searchParams.get('limit');

      const events = diagnosticsStore.query({
        type: type ?? undefined,
        sessionKey: sessionKey ?? undefined,
        channel: channel ?? undefined,
        since: since ? parseInt(since, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : 100,
      });

      sendJson(res, { events, stats: diagnosticsStore.getStats(), summary: diagnosticsStore.getSummary() });
      return true;
    }

    // GET /observatory/api/events/heartbeats - Query heartbeat events
    if (url.pathname === '/observatory/api/events/heartbeats') {
      const status = url.searchParams.get('status') as any;
      const channel = url.searchParams.get('channel');
      const since = url.searchParams.get('since');
      const limit = url.searchParams.get('limit');

      const events = heartbeatTracker.query({
        status: status ?? undefined,
        channel: channel ?? undefined,
        since: since ? parseInt(since, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : 20,
      });

      sendJson(res, { events, stats: heartbeatTracker.getStats() });
      return true;
    }

    // GET /observatory/api/runs/{runId}/timeline - Detailed execution timeline
    if (url.pathname.startsWith('/observatory/api/runs/') && url.pathname.endsWith('/timeline')) {
      const runId = url.pathname.split('/')[4];
      if (!runId) {
        sendError(res, 'Missing runId', 400);
        return true;
      }

      const events = agentEventStore.getByRunId(runId);
      const timeline = events.map(e => ({
        seq: e.seq,
        ts: e.ts,
        stream: e.stream,
        data: e.data,
      }));

      sendJson(res, { runId, timeline, totalEvents: timeline.length });
      return true;
    }

    // GET /observatory/api/diagnostics/summary - Aggregated diagnostic metrics
    if (url.pathname === '/observatory/api/diagnostics/summary') {
      const summary = diagnosticsStore.getSummary();
      const stats = diagnosticsStore.getStats();
      const recent = diagnosticsStore.getRecent(10);

      sendJson(res, { summary, stats, recent });
      return true;
    }

    // GET /observatory/api/heartbeats/health - Heartbeat health status
    if (url.pathname === '/observatory/api/heartbeats/health') {
      const stats = heartbeatTracker.getStats();
      const lastEvent = heartbeatTracker.getLastEvent();
      const consecutiveFailures = heartbeatTracker.getConsecutiveFailures();

      sendJson(res, {
        ...stats,
        lastEvent,
        consecutiveFailures,
        healthy: consecutiveFailures < 3 && stats.successRate >= 0.8,
      });
      return true;
    }

    // GET /observatory/api/hooks - Query lifecycle hook events
    if (url.pathname === '/observatory/api/hooks') {
      const hookName = url.searchParams.get('hookName');
      const sessionKey = url.searchParams.get('sessionKey');
      const since = url.searchParams.get('since');
      const limit = url.searchParams.get('limit');

      const events = hooksStore.query({
        hookName: hookName ?? undefined,
        sessionKey: sessionKey ?? undefined,
        since: since ? parseInt(since, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : 50,
      });

      sendJson(res, { events, stats: hooksStore.getStats() });
      return true;
    }

    // GET /observatory/api/metrics/history - Get aggregated metrics history
    if (url.pathname === '/observatory/api/metrics/history') {
      const limit = url.searchParams.get('limit');
      const history = observatoryService?.getMetricsHistory(
        limit ? parseInt(limit, 10) : undefined
      ) ?? [];

      sendJson(res, { history, count: history.length });
      return true;
    }

    // GET /observatory/api/metrics/latest - Get latest aggregated metrics
    if (url.pathname === '/observatory/api/metrics/latest') {
      const latest = observatoryService?.getLatestMetrics() ?? null;

      sendJson(res, { metrics: latest });
      return true;
    }

    // 1. SSE: Live Logs
    if (url.pathname === '/observatory/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      const send = (line: string) => res.write(`data: ${line}\n\n`);
      connections.add(send);
      setupTail();
      send(JSON.stringify({ type: 'system', message: 'Connected to Observatory API' }));
      req.on('close', () => {
        connections.delete(send);
        if (connections.size === 0) stopTail();
      });
      return true;
    }

    // 2. GET /observatory/api/agents
    // List all configured agents and their metadata
    if (url.pathname === '/observatory/api/agents') {
      const agents = api.config.agents.list.map(agent => {
        // Find bindings for this agent
        const bindings = (api.config.bindings || [])
          .filter((b: any) => b.agentId === agent.id)
          .map((b: any) => b.match);

        return {
          id: agent.id,
          name: agent.name,
          model: agent.model,
          workspace: agent.workspace,
          isDefault: agent.default || false,
          bindings
        };
      });
      sendJson(res, { agents });
      return true;
    }

    // 2.1 GET /observatory/api/channels
    // List all channels, accounts, and groups, resolved to agents
    if (url.pathname === '/observatory/api/channels') {
      const channelsConfig = JSON.parse(JSON.stringify(api.config.channels || {}));
      const bindings = api.config.bindings || [];

      // Enrich accounts with bound agentId
      for (const platform in channelsConfig) {
        const accounts = channelsConfig[platform].accounts || {};
        for (const accountId in accounts) {
          // Find binding that matches { channel: platform, accountId: accountId }
          // OR { channel: platform } if generic
          const binding = bindings.find((b: any) => 
            b.match.channel === platform && 
            (b.match.accountId === accountId || !b.match.accountId)
          );
          
          if (binding) {
            accounts[accountId].boundAgentId = binding.agentId;
          }
        }
      }

      sendJson(res, { channels: channelsConfig });
      return true;
    }

    // 3. GET /observatory/api/sessions
    // Aggregate sessions from all agents
    if (url.pathname === '/observatory/api/sessions') {
      const allSessions: AgentSessionSummary[] = [];
      
      for (const agent of api.config.agents.list) {
        const { sessions, roots } = await loadSessionStoreForAgent(agent);
        const activeSessionIds = new Set<string>();

        if (sessions) {
          for (const [key, data] of Object.entries(sessions)) {
            const sessionData = data as SessionRegistryEntry;
            allSessions.push({
              agentId: agent.id,
              sessionKey: key,
              sessionId: sessionData.sessionId,
              updatedAt: sessionData.updatedAt,
              displayName: sessionData.displayName,
              chatType: sessionData.chatType,
            });
            if (sessionData.sessionId) {
              activeSessionIds.add(sessionData.sessionId);
            }
          }
        }

        const archived = await listArchivedTranscripts(roots);
        for (const entry of archived) {
          if (activeSessionIds.has(entry.sessionId)) continue;
          allSessions.push({
            agentId: agent.id,
            sessionKey: `agent:${agent.id}:archived:${entry.sessionId}`,
            sessionId: entry.sessionId,
            updatedAt: entry.updatedAt,
            archived: true,
            archivedAt: entry.archivedAt,
            archiveReason: entry.reason,
          });
        }
      }
      
      // Sort by recency
      allSessions.sort((a, b) => b.updatedAt - a.updatedAt);
      sendJson(res, { sessions: allSessions });
      return true;
    }

    // 4. GET /observatory/api/transcript?agentId=...&sessionId=...
    // Also supports: ?sessionKey=agent:scout:subagent:uuid (looks up actual sessionId from registry)
    // Get full chat history for a specific session
    if (url.pathname === '/observatory/api/transcript') {
      let agentId = url.searchParams.get('agentId');
      let sessionId = url.searchParams.get('sessionId');
      const sessionKey = url.searchParams.get('sessionKey');

      // If sessionKey provided, parse it and look up actual sessionId
      if (sessionKey) {
        const keyMatch = sessionKey.match(/^agent:([^:]+):/);
        if (keyMatch) {
          agentId = keyMatch[1];
        }
      }

      if (!agentId) {
        sendError(res, 'Missing agentId', 400);
        return true;
      }

      const agent = api.config.agents?.list?.find(a => a.id === agentId);
      if (!agent) {
        sendError(res, 'Agent not found', 404);
        return true;
      }

      const { sessions, roots } = await loadSessionStoreForAgent(agent);
      let sessionFile: string | undefined;

      if (sessionKey && sessions && sessions[sessionKey]) {
        const entry = sessions[sessionKey] as SessionRegistryEntry;
        if (entry.sessionId) sessionId = entry.sessionId;
        if (entry.sessionFile) sessionFile = entry.sessionFile;
      }

      if (!sessionId && sessionKey?.includes(':archived:')) {
        const fallback = sessionKey.split(':').pop();
        if (fallback) sessionId = fallback;
      }

      if (!sessionId && sessionKey) {
        const uuidMatch = sessionKey.match(/([a-f0-9-]{36})$/);
        if (uuidMatch) {
          sessionId = uuidMatch[1];
        }
      }

      if (!agentId || !sessionId) {
        sendError(res, 'Missing agentId or sessionId', 400);
        return true;
      }

      if (!sessionFile && sessions) {
        for (const entry of Object.values(sessions)) {
          const data = entry as SessionRegistryEntry;
          if (data.sessionId === sessionId && data.sessionFile) {
            sessionFile = data.sessionFile;
            break;
          }
        }
      }

      const resolved = await resolveTranscriptPath({
        sessionId,
        roots,
        sessionFile,
      });

      if (!resolved) {
        sendError(res, 'Transcript not found', 404);
        return true;
      }

      try {
        const content = await fs.promises.readFile(resolved.path, 'utf-8');
        const messages = content.trim().split('\n')
          .map(line => {
            try { return JSON.parse(line); } catch (e) { return null; }
          })
          .filter(Boolean);

        sendJson(res, { messages });
      } catch (e: any) {
        sendError(res, `Failed to read transcript: ${e.message}`);
      }
      return true;
    }

    // 5. GET /observatory/api/runs
    // Get sub-agent run hierarchy
    if (url.pathname === '/observatory/api/runs') {
      const runsPath = path.join(os.homedir(), '.clawdbot/subagents/runs.json');
      try {
        const content = await fs.promises.readFile(runsPath, 'utf-8');
        const data = JSON.parse(content);

        // Transform backend fields to match UI expectations
        const transformedRuns: Record<string, any> = {};
        for (const [runId, run] of Object.entries(data.runs || {})) {
          const r = run as any;
          transformedRuns[runId] = {
            ...r,
            // Map endedAt -> completedAt
            completedAt: r.endedAt || r.completedAt,
            // Transform outcome.status to outcome.success
            outcome: r.outcome ? {
              success: r.outcome.status === 'ok',
              error: r.outcome.error,
              result: r.outcome.result,
            } : undefined,
          };
        }

        sendJson(res, { runs: transformedRuns });
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          // Return empty structure if file doesn't exist yet
          sendJson(res, { runs: {} });
        } else {
          sendError(res, `Failed to parse runs: ${e.message}`);
        }
      }
      return true;
    }

    // 6. GET /observatory/api/stats
    // Get aggregate statistics (costs, tokens, session counts)
    if (url.pathname === '/observatory/api/stats') {
      // Check cache
      if (statsCache && Date.now() - statsCache.timestamp < STATS_CACHE_TTL) {
        sendJson(res, { stats: statsCache.stats });
        return true;
      }

      const stats = {
        totalSessions: 0,
        totalMessages: 0,
        totalCost: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        byAgent: {} as Record<string, {
          sessions: number
          messages: number
          cost: number
          tokens: number
        }>,
        recentCost24h: 0,
        recentMessages24h: 0,
      };

      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

      for (const agent of api.config.agents.list) {
        const agentStats = {
          sessions: 0,
          messages: 0,
          cost: 0,
          tokens: 0,
        };

        const { sessions, roots } = await loadSessionStoreForAgent(agent);
        const activeSessionIds = new Set<string>();

        if (sessions) {
          const sessionCount = Object.keys(sessions).length;
          agentStats.sessions += sessionCount;
          stats.totalSessions += sessionCount;

          for (const [, sessionData] of Object.entries(sessions)) {
            const data = sessionData as SessionRegistryEntry;
            if (data.sessionId) activeSessionIds.add(data.sessionId);

            const resolved = await resolveTranscriptPath({
              sessionId: data.sessionId,
              roots,
              sessionFile: data.sessionFile,
            });
            if (!resolved) continue;

            try {
              await forEachTranscriptEntry(resolved.path, (entry) => {
                if (entry.type === 'message' && entry.message) {
                  agentStats.messages++;
                  stats.totalMessages++;

                  const msg = entry.message;
                  const timestamp = entry.timestamp || 0;

                  // Count tokens
                  if (msg.api === 'anthropic-messages' && msg.usage) {
                    const inputTokens = msg.usage.input || 0;
                    const outputTokens = msg.usage.output || 0;
                    const cacheRead = msg.usage.cacheRead || 0;
                    const cacheWrite = msg.usage.cacheWrite || 0;

                    stats.totalInputTokens += inputTokens;
                    stats.totalOutputTokens += outputTokens;
                    stats.cacheReadTokens += cacheRead;
                    stats.cacheWriteTokens += cacheWrite;
                    agentStats.tokens += inputTokens + outputTokens;
                    stats.totalTokens += inputTokens + outputTokens;
                  }

                  // Count costs
                  if (msg.usage?.cost?.total) {
                    const cost = msg.usage.cost.total;
                    agentStats.cost += cost;
                    stats.totalCost += cost;

                    if (timestamp > oneDayAgo) {
                      stats.recentCost24h += cost;
                      stats.recentMessages24h++;
                    }
                  }
                }
              });
            } catch {
              // Ignore transcript read errors
            }
          }
        }

        const archived = await listArchivedTranscripts(roots);
        const archivedToInclude = archived.filter((entry) => !activeSessionIds.has(entry.sessionId));
        if (archivedToInclude.length > 0) {
          agentStats.sessions += archivedToInclude.length;
          stats.totalSessions += archivedToInclude.length;

          for (const entry of archivedToInclude) {
            try {
              await forEachTranscriptEntry(entry.filePath, (lineEntry) => {
                if (lineEntry.type === 'message' && lineEntry.message) {
                  agentStats.messages++;
                  stats.totalMessages++;

                  const msg = lineEntry.message;
                  const timestamp = lineEntry.timestamp || 0;

                  if (msg.api === 'anthropic-messages' && msg.usage) {
                    const inputTokens = msg.usage.input || 0;
                    const outputTokens = msg.usage.output || 0;
                    const cacheRead = msg.usage.cacheRead || 0;
                    const cacheWrite = msg.usage.cacheWrite || 0;

                    stats.totalInputTokens += inputTokens;
                    stats.totalOutputTokens += outputTokens;
                    stats.cacheReadTokens += cacheRead;
                    stats.cacheWriteTokens += cacheWrite;
                    agentStats.tokens += inputTokens + outputTokens;
                    stats.totalTokens += inputTokens + outputTokens;
                  }

                  if (msg.usage?.cost?.total) {
                    const cost = msg.usage.cost.total;
                    agentStats.cost += cost;
                    stats.totalCost += cost;

                    if (timestamp > oneDayAgo) {
                      stats.recentCost24h += cost;
                      stats.recentMessages24h++;
                    }
                  }
                }
              });
            } catch {
              // Ignore transcript read errors
            }
          }
        }

        if (agentStats.sessions > 0 || agentStats.messages > 0) {
          stats.byAgent[agent.id] = agentStats;
        }
      }

      // Cache the result
      statsCache = { stats, timestamp: Date.now() };

      sendJson(res, { stats });
      return true;
    }

    // 6.5 GET /observatory/api/metrics
    // Get detailed analytics metrics (cost breakdown, token usage, tool usage, etc.)
    if (url.pathname === '/observatory/api/metrics') {
      const timeRange = url.searchParams.get('range') || 'all';
      const metricsData = {
        stats: {} as any,
        costByModel: {} as Record<string, number>,
        tokensByModel: {} as Record<string, number>,
        toolUsage: {} as Record<string, number>,
        cacheHitRatio: 0,
        avgSessionLength: 0,
        sessionsPerHour: {} as Record<string, number>,
        toolSuccessRate: {} as Record<string, number>,
      };

      const now = Date.now();
      let rangeMs = 0;
      if (timeRange === '24h') rangeMs = 24 * 60 * 60 * 1000;
      else if (timeRange === '7d') rangeMs = 7 * 24 * 60 * 60 * 1000;
      else if (timeRange === '30d') rangeMs = 30 * 24 * 60 * 60 * 1000;
      // else 'all' - no filter

      const baseStats = {
        totalSessions: 0,
        totalMessages: 0,
        totalCost: 0,
        totalTokens: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        byAgent: {} as Record<string, any>,
      };

      const sessionLengths: number[] = [];
      const toolCalls: Record<string, { success: number; total: number }> = {};

      for (const agent of api.config.agents.list) {
        const agentStats = {
          sessions: 0,
          messages: 0,
          cost: 0,
          tokens: 0,
        };

        const { sessions, roots } = await loadSessionStoreForAgent(agent);
        const activeSessionIds = new Set<string>();

        if (sessions) {
          for (const [, sessionData] of Object.entries(sessions)) {
            const data = sessionData as SessionRegistryEntry;
            if (data.sessionId) activeSessionIds.add(data.sessionId);

            const resolved = await resolveTranscriptPath({
              sessionId: data.sessionId,
              roots,
              sessionFile: data.sessionFile,
            });
            if (!resolved) continue;

            let messageCount = 0;
            try {
              await forEachTranscriptEntry(resolved.path, (entry) => {
                if (entry.type === 'message' && entry.message) {
                  const timestamp = entry.timestamp || 0;

                  // Apply time range filter
                  if (rangeMs > 0 && timestamp < now - rangeMs) {
                    return;
                  }

                  messageCount++;
                  agentStats.messages++;
                  baseStats.totalMessages++;

                  const m = entry.message;

                  // Cost tracking
                  if (m.usage?.cost?.total) {
                    const cost = m.usage.cost.total;
                    agentStats.cost += cost;
                    baseStats.totalCost += cost;
                    const model = m.model || 'unknown';
                    metricsData.costByModel[model] = (metricsData.costByModel[model] || 0) + cost;
                  }

                  // Token tracking
                  if (m.usage) {
                    const inputTokens = m.usage.input || 0;
                    const outputTokens = m.usage.output || 0;
                    const tokens = inputTokens + outputTokens;

                    agentStats.tokens += tokens;
                    baseStats.totalTokens += tokens;
                    baseStats.totalInputTokens += inputTokens;
                    baseStats.totalOutputTokens += outputTokens;

                    const model = m.model || 'unknown';
                    metricsData.tokensByModel[model] = (metricsData.tokensByModel[model] || 0) + tokens;

                    // Cache stats
                    const cacheRead = m.usage.cacheRead || 0;
                    const cacheWrite = m.usage.cacheWrite || 0;
                    baseStats.cacheReadTokens += cacheRead;
                    baseStats.cacheWriteTokens += cacheWrite;
                  }

                  // Tool usage tracking
                  if (m.content && Array.isArray(m.content)) {
                    for (const item of m.content) {
                      if (item.type === 'toolCall') {
                        const toolName = item.name || 'unknown';
                        metricsData.toolUsage[toolName] = (metricsData.toolUsage[toolName] || 0) + 1;

                        if (!toolCalls[toolName]) {
                          toolCalls[toolName] = { success: 0, total: 0 };
                        }
                        toolCalls[toolName].total++;
                      }
                    }
                  }

                  // Time distribution
                  if (timestamp > 0) {
                    const dt = new Date(timestamp);
                    const hourKey = dt.toISOString().split('T')[0] + ' ' + dt.getHours().toString().padStart(2, '0') + ':00';
                    metricsData.sessionsPerHour[hourKey] = (metricsData.sessionsPerHour[hourKey] || 0) + 1;
                  }
                }
              });
            } catch {
              // Ignore transcript errors
            }

            if (messageCount > 0) {
              agentStats.sessions++;
              baseStats.totalSessions++;
              sessionLengths.push(messageCount);
            }
          }
        }

        const archived = await listArchivedTranscripts(roots);
        const archivedToInclude = archived.filter((entry) => !activeSessionIds.has(entry.sessionId));
        for (const entry of archivedToInclude) {
          let messageCount = 0;
          try {
            await forEachTranscriptEntry(entry.filePath, (lineEntry) => {
              if (lineEntry.type === 'message' && lineEntry.message) {
                const timestamp = lineEntry.timestamp || 0;

                if (rangeMs > 0 && timestamp < now - rangeMs) {
                  return;
                }

                messageCount++;
                agentStats.messages++;
                baseStats.totalMessages++;

                const m = lineEntry.message;

                if (m.usage?.cost?.total) {
                  const cost = m.usage.cost.total;
                  agentStats.cost += cost;
                  baseStats.totalCost += cost;
                  const model = m.model || 'unknown';
                  metricsData.costByModel[model] = (metricsData.costByModel[model] || 0) + cost;
                }

                if (m.usage) {
                  const inputTokens = m.usage.input || 0;
                  const outputTokens = m.usage.output || 0;
                  const tokens = inputTokens + outputTokens;

                  agentStats.tokens += tokens;
                  baseStats.totalTokens += tokens;
                  baseStats.totalInputTokens += inputTokens;
                  baseStats.totalOutputTokens += outputTokens;

                  const model = m.model || 'unknown';
                  metricsData.tokensByModel[model] = (metricsData.tokensByModel[model] || 0) + tokens;

                  const cacheRead = m.usage.cacheRead || 0;
                  const cacheWrite = m.usage.cacheWrite || 0;
                  baseStats.cacheReadTokens += cacheRead;
                  baseStats.cacheWriteTokens += cacheWrite;
                }

                if (m.content && Array.isArray(m.content)) {
                  for (const item of m.content) {
                    if (item.type === 'toolCall') {
                      const toolName = item.name || 'unknown';
                      metricsData.toolUsage[toolName] = (metricsData.toolUsage[toolName] || 0) + 1;

                      if (!toolCalls[toolName]) {
                        toolCalls[toolName] = { success: 0, total: 0 };
                      }
                      toolCalls[toolName].total++;
                    }
                  }
                }

                if (timestamp > 0) {
                  const dt = new Date(timestamp);
                  const hourKey = dt.toISOString().split('T')[0] + ' ' + dt.getHours().toString().padStart(2, '0') + ':00';
                  metricsData.sessionsPerHour[hourKey] = (metricsData.sessionsPerHour[hourKey] || 0) + 1;
                }
              }
            });
          } catch {
            // Ignore transcript errors
          }

          if (messageCount > 0) {
            agentStats.sessions++;
            baseStats.totalSessions++;
            sessionLengths.push(messageCount);
          }
        }

        if (agentStats.sessions > 0 || agentStats.messages > 0) {
          baseStats.byAgent[agent.id] = agentStats;
        }
      }

      // Calculate derived metrics
      if (sessionLengths.length > 0) {
        metricsData.avgSessionLength = sessionLengths.reduce((a, b) => a + b, 0) / sessionLengths.length;
      }

      const totalCache = baseStats.cacheReadTokens + baseStats.cacheWriteTokens;
      if (totalCache > 0) {
        metricsData.cacheHitRatio = baseStats.cacheReadTokens / totalCache;
      }

      metricsData.stats = baseStats;

      sendJson(res, { data: metricsData });
      return true;
    }

    // 7. GET /observatory/api/config
    // Export full sanitized config
    if (url.pathname === '/observatory/api/config') {
      // Create a deep copy to sanitize
      const safeConfig = JSON.parse(JSON.stringify(api.config));
      // Redact sensitive keys
      if (safeConfig.env) safeConfig.env = { redacted: true };
      if (safeConfig.hooks?.token) safeConfig.hooks.token = '***';
      sendJson(res, safeConfig);
      return true;
    }

    // 7. Serve static UI files
    if (url.pathname.startsWith('/observatory')) {
      // Map URL path to file path
      let filePath = url.pathname.replace('/observatory', '');
      if (filePath === '' || filePath === '/') {
        filePath = '/index.html';
      }
      
      const fullPath = path.join(UI_DIST, filePath);
      
      // Security: ensure we're still within UI_DIST
      if (!fullPath.startsWith(UI_DIST)) {
        sendError(res, 'Forbidden', 403);
        return true;
      }

      try {
        await fs.promises.access(fullPath);
        const stat = await fs.promises.stat(fullPath);
        
        if (stat.isDirectory()) {
          // Serve index.html for directories
          const indexPath = path.join(fullPath, 'index.html');
          await fs.promises.access(indexPath);
          const content = await fs.promises.readFile(indexPath);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
          return true;
        }

        // Determine content type
        const ext = path.extname(fullPath).toLowerCase();
        const contentTypes: Record<string, string> = {
          '.html': 'text/html',
          '.js': 'application/javascript',
          '.css': 'text/css',
          '.json': 'application/json',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.ico': 'image/x-icon',
          '.woff': 'font/woff',
          '.woff2': 'font/woff2',
          '.ttf': 'font/ttf',
        };
        const contentType = contentTypes[ext] || 'application/octet-stream';

        const content = await fs.promises.readFile(fullPath);
        res.writeHead(200, { 
          'Content-Type': contentType,
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000'
        });
        res.end(content);
        return true;
      } catch (e: any) {
        if (e.code === 'ENOENT') {
          // For SPA routing, serve index.html for unknown paths
          try {
            const indexPath = path.join(UI_DIST, 'index.html');
            const content = await fs.promises.readFile(indexPath);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
            return true;
          } catch {
            sendError(res, 'UI not built. Run: cd extensions/observatory/ui && pnpm run build', 404);
            return true;
          }
        }
        sendError(res, `Failed to serve file: ${e.message}`);
        return true;
      }
    }

    return false;
  };

  api.registerHttpHandler(handler);
}

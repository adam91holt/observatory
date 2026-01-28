// Agent tool type
type AnyAgentTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
};
import type { AgentEventStore } from '../event-store.js';
import type { DiagnosticsStore } from '../diagnostics-store.js';
import type { HeartbeatTracker } from '../heartbeat-tracker.js';
import type { HooksStore } from '../hooks-store.js';

export function createObservatoryQueryTool(params: {
  agentEventStore: AgentEventStore;
  diagnosticsStore: DiagnosticsStore;
  heartbeatTracker: HeartbeatTracker;
  hooksStore: HooksStore;
}): AnyAgentTool {
  const { agentEventStore, diagnosticsStore, heartbeatTracker, hooksStore } = params;

  return {
    name: 'observatory_query',
    description: `Query Observatory monitoring data for session history, run metrics, tool usage, and system health.

    Use this tool to:
    - Get recent agent runs and their status
    - View session history and activity
    - Check tool usage statistics
    - Monitor system health and diagnostics
    - Analyze token usage and costs
    - Review heartbeat status`,
    input_schema: {
      type: 'object',
      properties: {
        query_type: {
          type: 'string',
          enum: [
            'recent_runs',
            'session_history',
            'tool_usage',
            'diagnostics_summary',
            'heartbeat_health',
            'agent_events',
            'hooks_summary'
          ],
          description: 'The type of data to query from Observatory',
        },
        session_key: {
          type: 'string',
          description: 'Optional: filter by session key',
        },
        run_id: {
          type: 'string',
          description: 'Optional: filter by run ID',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (default: 10)',
        },
        time_range: {
          type: 'string',
          enum: ['1h', '6h', '24h', '7d', 'all'],
          description: 'Time range for the query (default: 24h)',
        },
      },
      required: ['query_type'],
    },
    execute: async (input) => {
      const queryType = input.query_type as string;
      const sessionKey = input.session_key as string | undefined;
      const runId = input.run_id as string | undefined;
      const limit = (input.limit as number | undefined) ?? 10;
      const timeRange = (input.time_range as string | undefined) ?? '24h';

      // Calculate timestamp for time range
      const now = Date.now();
      let since: number | undefined;
      if (timeRange !== 'all') {
        const rangeMs = {
          '1h': 60 * 60 * 1000,
          '6h': 6 * 60 * 60 * 1000,
          '24h': 24 * 60 * 60 * 1000,
          '7d': 7 * 24 * 60 * 60 * 1000,
        }[timeRange];
        since = rangeMs ? now - rangeMs : undefined;
      }

      try {
        switch (queryType) {
          case 'recent_runs': {
            const events = agentEventStore.query({ since, limit: limit * 10 });
            const runIds = new Set(events.map(e => e.runId));
            const runs = Array.from(runIds).slice(-limit).map(rid => {
              const runEvents = agentEventStore.getByRunId(rid);
              const lifecycleEvents = runEvents.filter(e => e.stream === 'lifecycle');
              const toolEvents = runEvents.filter(e => e.stream === 'tool');

              return {
                runId: rid,
                sessionKey: runEvents[0]?.sessionKey,
                eventCount: runEvents.length,
                toolCalls: toolEvents.length,
                startTime: runEvents[0]?.ts,
                endTime: runEvents[runEvents.length - 1]?.ts,
                streams: [...new Set(runEvents.map(e => e.stream))],
              };
            });

            return {
              success: true,
              data: {
                runs,
                totalRuns: runs.length,
                timeRange,
              },
            };
          }

          case 'session_history': {
            if (!sessionKey) {
              return {
                success: false,
                error: 'session_key is required for session_history query',
              };
            }

            const events = agentEventStore.getBySessionKey(sessionKey);
            const hookEvents = hooksStore.getBySession(sessionKey);

            return {
              success: true,
              data: {
                sessionKey,
                agentEvents: events.length,
                hookEvents: hookEvents.length,
                recentAgentEvents: events.slice(-limit),
                recentHooks: hookEvents.slice(-limit),
              },
            };
          }

          case 'tool_usage': {
            const events = agentEventStore.query({ stream: 'tool', since, limit: 1000 });
            const toolCounts: Record<string, number> = {};
            const toolErrors: Record<string, number> = {};

            for (const event of events) {
              const toolName = (event.data as any).toolName;
              if (toolName) {
                toolCounts[toolName] = (toolCounts[toolName] ?? 0) + 1;
                if ((event.data as any).error) {
                  toolErrors[toolName] = (toolErrors[toolName] ?? 0) + 1;
                }
              }
            }

            const topTools = Object.entries(toolCounts)
              .map(([name, count]) => ({
                name,
                count,
                errors: toolErrors[name] ?? 0,
                successRate: ((count - (toolErrors[name] ?? 0)) / count) * 100,
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limit);

            return {
              success: true,
              data: {
                topTools,
                totalToolCalls: events.length,
                uniqueTools: Object.keys(toolCounts).length,
                timeRange,
              },
            };
          }

          case 'diagnostics_summary': {
            const summary = diagnosticsStore.getSummary();
            const stats = diagnosticsStore.getStats();
            const recent = diagnosticsStore.getRecent(limit);

            return {
              success: true,
              data: {
                summary,
                stats,
                recentEvents: recent,
              },
            };
          }

          case 'heartbeat_health': {
            const stats = heartbeatTracker.getStats();
            const lastEvent = heartbeatTracker.getLastEvent();
            const recent = heartbeatTracker.getRecent(limit);

            return {
              success: true,
              data: {
                stats,
                lastEvent,
                recentHeartbeats: recent,
                healthy: stats.consecutiveFailures < 3 && stats.successRate >= 0.8,
              },
            };
          }

          case 'agent_events': {
            const query: any = { since, limit };
            if (sessionKey) query.sessionKey = sessionKey;
            if (runId) query.runId = runId;

            const events = agentEventStore.query(query);
            const stats = agentEventStore.getStats();

            return {
              success: true,
              data: {
                events,
                stats,
                count: events.length,
              },
            };
          }

          case 'hooks_summary': {
            const stats = hooksStore.getStats();
            const recent = hooksStore.getRecent(limit);

            return {
              success: true,
              data: {
                stats,
                recentHooks: recent,
              },
            };
          }

          default:
            return {
              success: false,
              error: `Unknown query_type: ${queryType}`,
            };
        }
      } catch (error: any) {
        return {
          success: false,
          error: `Observatory query failed: ${error.message}`,
        };
      }
    },
  };
}

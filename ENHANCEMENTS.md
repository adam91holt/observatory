# Observatory Plugin Enhancements

This document describes the comprehensive enhancements made to the Observatory plugin to transform it into a full-featured command center for Moltbot.

## Overview

Observatory has been enhanced from a basic HTTP monitoring tool to a comprehensive observability platform with:
- Real-time event streaming via agent/diagnostic/heartbeat event systems
- Lifecycle hook integration for capturing all agent/gateway events
- Background service for event aggregation and retention
- Agent tool for querying Observatory data from within conversations
- Extended HTTP API with analytics and metrics endpoints

## Architecture

### Event Stores

Four specialized event stores capture different types of data:

1. **AgentEventStore** (`src/event-store.ts`)
   - Captures agent execution events (lifecycle, tool, assistant, error streams)
   - Indexes by runId and sessionKey
   - Configurable retention (default: 1000 events, 24h)

2. **DiagnosticsStore** (`src/diagnostics-store.ts`)
   - Captures diagnostic events (model usage, webhooks, queue depth, session state)
   - Indexes by event type
   - Provides summary statistics by type

3. **HeartbeatTracker** (`src/heartbeat-tracker.ts`)
   - Tracks scheduled heartbeat delivery
   - Monitors success rate and consecutive failures
   - Alerts on degradation (< 80% success rate or 3+ consecutive failures)

4. **HooksStore** (`src/hooks-store.ts`)
   - Captures lifecycle hook events (before_agent_start, agent_end, etc.)
   - Indexes by hook name and sessionKey
   - Provides hook execution statistics

### Event Subscriptions

The plugin subscribes to three core event systems:

- `onAgentEvent()` - Agent execution events
- `onDiagnosticEvent()` - System diagnostic events
- `onHeartbeatEvent()` - Heartbeat delivery events

These subscriptions are configurable via plugin config:

```json
{
  "plugins": {
    "entries": {
      "observatory": {
        "enabled": true,
        "config": {
          "capture": {
            "agentEvents": true,
            "diagnostics": true,
            "heartbeats": true
          }
        }
      }
    }
  }
}
```

### Lifecycle Hooks

Observatory registers handlers for all 13 lifecycle hooks:

**Agent Hooks:**
- `before_agent_start` - Captures session start and system prompt injection
- `agent_end` - Tracks completion status, duration, token usage

**Session Hooks:**
- `session_start` - Logs session creation
- `session_end` - Records session termination

**Message Hooks:**
- `message_received` - Tracks incoming messages
- `message_sending` - Logs outgoing message preparation
- `message_sent` - Captures delivery status

**Tool Hooks:**
- `before_tool_call` - Pre-execution tool call logging
- `after_tool_call` - Tool result and timing capture
- `tool_result_persist` - Audit trail for finalized tool results

**Gateway Hooks:**
- `gateway_start` - Gateway initialization
- `gateway_stop` - Gateway shutdown

### Background Service

The `ObservatoryService` (`src/service.ts`) runs as a background service:

- Aggregates metrics every 60 seconds
- Computes derived statistics (success rates, token usage trends)
- Persists metrics history to `~/.moltbot/state/observatory-metrics.json`
- Handles cleanup and retention policies

### Agent Tool

The `observatory_query` tool allows agents to query Observatory data directly:

**Query Types:**
- `recent_runs` - Get recent agent runs and their status
- `session_history` - View session activity (requires session_key)
- `tool_usage` - Analyze tool call statistics
- `diagnostics_summary` - System health overview
- `heartbeat_health` - Heartbeat monitoring status
- `agent_events` - Raw agent event data
- `hooks_summary` - Lifecycle hook statistics

**Example Usage:**

```
User: "How many tool calls did I make in the last hour?"
Agent: [Calls observatory_query with query_type: "tool_usage", time_range: "1h"]
```

## API Endpoints

### New Event API Endpoints

```
GET /observatory/api/events/agent
  Query agent events
  Params: runId, sessionKey, stream, since, limit

GET /observatory/api/events/diagnostics
  Query diagnostic events
  Params: type, sessionKey, channel, since, limit

GET /observatory/api/events/heartbeats
  Query heartbeat events
  Params: status, channel, since, limit

GET /observatory/api/runs/{runId}/timeline
  Detailed execution timeline for a specific run

GET /observatory/api/diagnostics/summary
  Aggregated diagnostic metrics

GET /observatory/api/heartbeats/health
  Heartbeat health status and success rate

GET /observatory/api/hooks
  Query lifecycle hook events
  Params: hookName, sessionKey, since, limit

GET /observatory/api/metrics/history
  Aggregated metrics history (from background service)
  Params: limit

GET /observatory/api/metrics/latest
  Latest aggregated metrics snapshot
```

### Existing Endpoints (Unchanged)

```
GET /observatory/events
  SSE stream of live log lines

GET /observatory/api/agents
  List all configured agents

GET /observatory/api/channels
  List all channels and accounts

GET /observatory/api/sessions
  Aggregate sessions from all agents

GET /observatory/api/transcript
  Get full chat history for a session

GET /observatory/api/runs
  Get sub-agent run hierarchy

GET /observatory/api/stats
  Aggregate statistics (with 60s cache)

GET /observatory/api/metrics
  Detailed analytics metrics

GET /observatory/api/config
  Export sanitized config
```

## Configuration Schema

```json
{
  "retention": {
    "events": "7d",
    "metrics": "30d"
  },
  "capture": {
    "diagnostics": true,
    "heartbeats": true,
    "agentEvents": true
  }
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                      Moltbot Core                           │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────┐   │
│  │ Agent Events│  │ Diagnostic   │  │ Heartbeat       │   │
│  │ emitter     │  │ Events       │  │ Events          │   │
│  └──────┬──────┘  └──────┬───────┘  └────────┬────────┘   │
│         │                 │                    │            │
└─────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   Observatory Plugin                        │
│                                                             │
│  ┌──────────────┐ ┌────────────────┐ ┌──────────────────┐ │
│  │ AgentEvent   │ │ Diagnostics    │ │ Heartbeat        │ │
│  │ Store        │ │ Store          │ │ Tracker          │ │
│  └──────┬───────┘ └───────┬────────┘ └────────┬─────────┘ │
│         │                  │                   │           │
│         └──────────────────┴───────────────────┘           │
│                            │                               │
│                            ▼                               │
│                  ┌──────────────────┐                      │
│                  │ Background       │                      │
│                  │ Service          │                      │
│                  │ (Aggregation)    │                      │
│                  └────────┬─────────┘                      │
│                           │                                │
│                           ▼                                │
│                  ┌──────────────────┐                      │
│                  │ Metrics History  │                      │
│                  │ (Persisted)      │                      │
│                  └──────────────────┘                      │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │           HTTP API + Agent Tool                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
          │                                 │
          ▼                                 ▼
    ┌──────────┐                     ┌──────────┐
    │ Web UI   │                     │ Agent    │
    │ (React)  │                     │ (Tools)  │
    └──────────┘                     └──────────┘
```

## Performance Considerations

- **Memory Usage**: Default retention limits keep memory footprint reasonable:
  - 1000 agent events (~500KB)
  - 1000 diagnostic events (~300KB)
  - 100 heartbeat events (~20KB)
  - 500 hook events (~250KB)
  - **Total: ~1MB baseline memory**

- **Event Processing**: All event handlers use try-catch to prevent failures from affecting core Moltbot operation

- **Background Service**: Runs every 60s with unref() to prevent blocking shutdown

- **API Caching**: Stats endpoint uses 60s TTL cache to reduce transcript parsing overhead

## Testing

To test the enhancements:

1. **Enable Observatory plugin** in Moltbot config:
```json
{
  "plugins": {
    "entries": {
      "observatory": {
        "enabled": true
      }
    }
  }
}
```

2. **Start the gateway** and send some messages

3. **Query agent events**:
```bash
curl http://localhost:8080/observatory/api/events/agent?limit=10
```

4. **Check diagnostics**:
```bash
curl http://localhost:8080/observatory/api/diagnostics/summary
```

5. **Use the agent tool**:
```
User: "What tools have I used today?"
# Agent will call observatory_query tool
```

6. **View metrics history**:
```bash
curl http://localhost:8080/observatory/api/metrics/history?limit=10
```

## Future Enhancements

Potential future improvements (from the original plan):

- **SQLite persistence** for long-term event storage
- **WebSocket API** for real-time event streaming to UI
- **Custom webhooks** for external alerting
- **Anomaly detection** using ML-based patterns
- **Export formats** (Prometheus, JSON, CSV)
- **Replay mode** for debugging sessions
- **Distributed tracing** for multi-node setups

## Migration Notes

The enhancements are fully backward compatible:
- Existing API endpoints remain unchanged
- New features are opt-in via config
- Default configuration maintains previous behavior
- No breaking changes to UI

## Dependencies

No new NPM dependencies were added. All features use:
- Core Moltbot event systems
- Built-in Node.js APIs (fs, path, os)
- Existing plugin SDK exports

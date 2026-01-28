# Observatory API

The **Observatory** plugin provides a comprehensive HTTP API for inspecting the runtime state of your Clawdbot agents. It exposes agent configurations, session histories, sub-agent run hierarchies, and a live event stream.

**Base URL:** `http://localhost:18789` (default)

---

## Endpoints

### 1. List Agents
Returns a list of all configured agents, their models, workspace paths, and channel bindings.

- **URL:** `/observatory/api/agents`
- **Method:** `GET`

**Response:**
```json
{
  "agents": [
    {
      "id": "kev",
      "name": "Kev",
      "model": { "primary": "anthropic/claude-opus-4-5", ... },
      "workspace": "/Users/adam/agents/kev",
      "isDefault": true,
      "bindings": [
        { "channel": "whatsapp" },
        { "channel": "slack", "accountId": "kev" }
      ]
    },
    ...
  ]
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/agents
```

---

### 2. List Channels
Returns the full channel configuration, including accounts and groups, enriched with the ID of the agent bound to each account.

- **URL:** `/observatory/api/channels`
- **Method:** `GET`

**Response:**
```json
{
  "channels": {
    "whatsapp": {
      "accounts": {
        "kev": {
          "enabled": true,
          "groups": { "120363...@g.us": { "name": "Team" } },
          "boundAgentId": "kev"
        }
      }
    },
    "slack": {
      "accounts": {
        "rex": {
          "boundAgentId": "rex",
          "channels": { "*": { ... } }
        }
      }
    }
  }
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/channels
```

---

### 3. List Sessions
Returns a global list of all active sessions across all agents, sorted by most recent activity.

- **URL:** `/observatory/api/sessions`
- **Method:** `GET`

**Response:**
```json
{
  "sessions": [
    {
      "agentId": "kev",
      "sessionKey": "agent:kev:main",
      "sessionId": "161f551a-39c5-4ee3-9d05-0163fdc1f2a9",
      "updatedAt": 1768642607188
    },
    ...
  ]
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/sessions
```

---

### 4. Get Session Transcript
Fetches the full conversation history (transcript) for a specific session.

- **URL:** `/observatory/api/transcript`
- **Method:** `GET`
- **Query Params:**
    - `agentId` (required): The ID of the agent (e.g., `kev`).
    - `sessionId` (required): The UUID of the session (from the sessions list).

**Response:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": 1768642607188
    },
    {
      "role": "assistant",
      "content": "Hi there! How can I help?",
      "timestamp": 1768642608200
    }
  ]
}
```

**Example:**
```bash
curl "http://localhost:18789/observatory/api/transcript?agentId=kev&sessionId=161f551a-39c5-4ee3-9d05-0163fdc1f2a9"
```

---

### 5. Get Sub-Agent Runs
Returns the hierarchy of sub-agent task delegations.

- **URL:** `/observatory/api/runs`
- **Method:** `GET`

**Response:**
```json
{
  "version": 2,
  "runs": {
    "90d8cad4...": {
      "runId": "90d8cad4...",
      "requesterSessionKey": "agent:kev:main",
      "childSessionKey": "agent:scout:subagent:...",
      "task": "Get the current gold price...",
      "outcome": { "success": true, ... }
    }
  }
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/runs
```

---

### 6. Get Configuration
Returns the sanitized runtime configuration of Clawdbot (secrets redacted).

- **URL:** `/observatory/api/config`
- **Method:** `GET`

**Example:**
```bash
curl http://localhost:18789/observatory/api/config
```

---

### 7. Get Statistics
Returns aggregate statistics across all agents and sessions, including token usage, costs, and message counts.

- **URL:** `/observatory/api/stats`
- **Method:** `GET`

**Response:**
```json
{
  "stats": {
    "totalSessions": 42,
    "totalMessages": 567,
    "totalCost": 1.23,
    "totalTokens": 45678,
    "recentCost24h": 0.45,
    "byAgent": { "kev": { "sessions": 30, "messages": 400, "cost": 0.9 } }
  }
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/stats
```

---

### 8. Get Detailed Metrics
Returns detailed analytics including cost breakdown, token usage by model, and tool usage statistics.

- **URL:** `/observatory/api/metrics`
- **Method:** `GET`
- **Query Params:**
    - `range` (optional): Time range filter (`24h`, `7d`, `30d`, `all`)

**Example:**
```bash
curl "http://localhost:18789/observatory/api/metrics?range=24h"
```

---

### 9. Live Event Stream (SSE)
Subscribe to the real-time log firehose.

- **URL:** `/observatory/events`
- **Method:** `GET`
- **Headers:** `Accept: text/event-stream`

**Example:**
```bash
curl -N http://localhost:18789/observatory/events
```

---

## Event API Endpoints (New)

### 10. Query Agent Events
Returns agent execution events (lifecycle, tool, assistant, error streams).

- **URL:** `/observatory/api/events/agent`
- **Method:** `GET`
- **Query Params:**
    - `runId` (optional): Filter by run ID
    - `sessionKey` (optional): Filter by session key
    - `stream` (optional): Filter by stream type (`lifecycle`, `tool`, `assistant`, `error`)
    - `since` (optional): Timestamp to filter events after
    - `limit` (optional): Max results (default: 100)

**Response:**
```json
{
  "events": [
    {
      "id": "aevt-123",
      "runId": "90d8cad4...",
      "seq": 1,
      "stream": "tool",
      "ts": 1768642607188,
      "data": { "toolName": "web_search", ... },
      "sessionKey": "agent:kev:main"
    }
  ],
  "stats": {
    "totalEvents": 1234,
    "uniqueRuns": 56,
    "uniqueSessions": 23
  }
}
```

**Example:**
```bash
curl "http://localhost:18789/observatory/api/events/agent?stream=tool&limit=20"
```

---

### 11. Query Diagnostic Events
Returns system diagnostic events (model usage, webhooks, queue depth, session state).

- **URL:** `/observatory/api/events/diagnostics`
- **Method:** `GET`
- **Query Params:**
    - `type` (optional): Event type (`model.usage`, `webhook.received`, etc.)
    - `sessionKey` (optional): Filter by session
    - `channel` (optional): Filter by channel
    - `since` (optional): Timestamp filter
    - `limit` (optional): Max results (default: 100)

**Response:**
```json
{
  "events": [
    {
      "id": "devt-456",
      "type": "model.usage",
      "ts": 1768642607188,
      "sessionKey": "agent:kev:main",
      "provider": "anthropic",
      "usage": { "input": 1234, "output": 567 },
      "costUsd": 0.012
    }
  ],
  "stats": { "totalEvents": 890, "uniqueTypes": 8 },
  "summary": { "model.usage": 234, "webhook.received": 123 }
}
```

**Example:**
```bash
curl "http://localhost:18789/observatory/api/events/diagnostics?type=model.usage"
```

---

### 12. Query Heartbeat Events
Returns heartbeat delivery events.

- **URL:** `/observatory/api/events/heartbeats`
- **Method:** `GET`
- **Query Params:**
    - `status` (optional): Filter by status (`ok-empty`, `ok-token`, `sent`, `failed`, `skipped`)
    - `channel` (optional): Filter by channel
    - `since` (optional): Timestamp filter
    - `limit` (optional): Max results (default: 20)

**Response:**
```json
{
  "events": [
    {
      "id": "hevt-789",
      "ts": 1768642607188,
      "status": "ok-token",
      "channel": "whatsapp",
      "preview": "🟢 All systems operational",
      "durationMs": 234
    }
  ],
  "stats": {
    "totalEvents": 45,
    "successRate": 0.95,
    "consecutiveFailures": 0
  }
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/events/heartbeats
```

---

### 13. Get Run Timeline
Returns a detailed execution timeline for a specific run.

- **URL:** `/observatory/api/runs/{runId}/timeline`
- **Method:** `GET`
- **Path Params:**
    - `runId` (required): The run ID

**Response:**
```json
{
  "runId": "90d8cad4...",
  "timeline": [
    { "seq": 1, "ts": 1768642607188, "stream": "lifecycle", "data": { ... } },
    { "seq": 2, "ts": 1768642607234, "stream": "tool", "data": { "toolName": "web_search" } }
  ],
  "totalEvents": 45
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/runs/90d8cad4.../timeline
```

---

### 14. Get Diagnostics Summary
Returns aggregated diagnostic metrics.

- **URL:** `/observatory/api/diagnostics/summary`
- **Method:** `GET`

**Response:**
```json
{
  "summary": { "model.usage": 234, "webhook.received": 123 },
  "stats": { "totalEvents": 890, "uniqueTypes": 8 },
  "recent": [ ... ]
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/diagnostics/summary
```

---

### 15. Get Heartbeat Health
Returns heartbeat health status and metrics.

- **URL:** `/observatory/api/heartbeats/health`
- **Method:** `GET`

**Response:**
```json
{
  "totalEvents": 45,
  "successRate": 0.95,
  "consecutiveFailures": 0,
  "statusCounts": { "ok-token": 42, "failed": 3 },
  "lastEvent": { ... },
  "healthy": true
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/heartbeats/health
```

---

### 16. Query Lifecycle Hooks
Returns lifecycle hook execution events.

- **URL:** `/observatory/api/hooks`
- **Method:** `GET`
- **Query Params:**
    - `hookName` (optional): Filter by hook name
    - `sessionKey` (optional): Filter by session
    - `since` (optional): Timestamp filter
    - `limit` (optional): Max results (default: 50)

**Response:**
```json
{
  "events": [
    {
      "id": "hook-123",
      "ts": 1768642607188,
      "hookName": "before_agent_start",
      "context": { "agentId": "kev", "sessionKey": "agent:kev:main" },
      "event": { "prompt": "..." }
    }
  ],
  "stats": {
    "totalEvents": 456,
    "uniqueHooks": 12,
    "hookCounts": { "before_agent_start": 45, "agent_end": 45 }
  }
}
```

**Example:**
```bash
curl "http://localhost:18789/observatory/api/hooks?hookName=before_tool_call"
```

---

### 17. Get Metrics History
Returns aggregated metrics history from the background service.

- **URL:** `/observatory/api/metrics/history`
- **Method:** `GET`
- **Query Params:**
    - `limit` (optional): Max snapshots to return

**Response:**
```json
{
  "history": [
    {
      "timestamp": 1768642607188,
      "interval": "minute",
      "agentEvents": { "totalEvents": 123, "uniqueRuns": 12 },
      "diagnostics": { "totalEvents": 89, "byType": { ... } },
      "heartbeats": { "successRate": 0.95 },
      "hooks": { "totalEvents": 45 }
    }
  ],
  "count": 120
}
```

**Example:**
```bash
curl "http://localhost:18789/observatory/api/metrics/history?limit=10"
```

---

### 18. Get Latest Metrics
Returns the latest aggregated metrics snapshot.

- **URL:** `/observatory/api/metrics/latest`
- **Method:** `GET`

**Response:**
```json
{
  "metrics": {
    "timestamp": 1768642607188,
    "interval": "minute",
    "agentEvents": { ... },
    "diagnostics": { ... },
    "heartbeats": { ... },
    "hooks": { ... }
  }
}
```

**Example:**
```bash
curl http://localhost:18789/observatory/api/metrics/latest
```

---

## Agent Tool

Observatory also provides an agent tool that allows agents to query Observatory data from within conversations.

**Tool Name:** `observatory_query`

**Query Types:**
- `recent_runs` - Get recent agent runs
- `session_history` - View session activity (requires `session_key`)
- `tool_usage` - Analyze tool statistics
- `diagnostics_summary` - System health overview
- `heartbeat_health` - Heartbeat status
- `agent_events` - Raw agent events
- `hooks_summary` - Lifecycle hook stats

**Example Usage:**
```
User: "What tools have I used in the last hour?"
Agent: [Calls observatory_query with query_type: "tool_usage", time_range: "1h"]
```

---

## Configuration

Enable and configure Observatory in your Moltbot config:

```json
{
  "plugins": {
    "entries": {
      "observatory": {
        "enabled": true,
        "config": {
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
      }
    }
  }
}
```

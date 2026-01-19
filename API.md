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

### 7. Live Event Stream (SSE)
Subscribe to the real-time log firehose.

- **URL:** `/observatory/events`
- **Method:** `GET`
- **Headers:** `Accept: text/event-stream`

**Example:**
```bash
curl -N http://localhost:18789/observatory/events
```

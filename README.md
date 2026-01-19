# 🔭 Orchestrator Observatory

**Observatory** is a real-time command center for Clawdbot, providing complete visibility into your agent's brain across all channels.

## Features

- **Dashboard** — At-a-glance overview of agents, sessions, and activity
- **Channels View** — WhatsApp, Slack, Discord, Telegram grouped by account and group
- **Session Inspector** — Full transcripts with messages, tool calls, timing, cost, and tokens
- **Live Firehose** — Real-time log stream from Clawdbot
- **Sub-Agent Runs** — Task delegation tree between agents
- **Config Viewer** — Current runtime configuration (secrets redacted)

## Installation

### 1. Install the plugin

```bash
# GitHub Packages (private)
cat <<'EOF' > ~/.npmrc
@adam91holt:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
EOF

clawdbot plugins install @adam91holt/observatory
```

For local development instead:

```bash
clawdbot plugins install /path/to/observatory
```

### 2. Configure Clawdbot

If you installed from a package, you only need to enable it:

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

If you installed from a local path, add `load.paths` pointing at the folder that contains the plugin `package.json`:

```json
{
  "plugins": {
    "load": {
      "paths": ["/path/to/observatory"]
    },
    "entries": {
      "observatory": {
        "enabled": true
      }
    }
  }
}
```

### 3. Build the UI (local dev)

```bash
cd ui
pnpm install
pnpm run build
```

### 4. Restart Clawdbot

Restart your Clawdbot gateway/daemon to load the extension.

## Usage

Navigate to **`http://localhost:18789/observatory/`** in your browser.

## Development

For local development with hot reload:

```bash
cd ui
pnpm run dev
```

The dev server proxies API requests to `http://localhost:18789`.

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Styling:** Tailwind CSS v4 + shadcn-style components
- **Icons:** Lucide React
- **State:** Zustand + React Query
- **Markdown:** react-markdown with GFM + syntax highlighting

## Architecture

- **Backend:** Node.js plugin that exposes REST API endpoints and SSE for live events
- **Frontend:** React SPA that visualizes agents, sessions, and logs

## API Endpoints

See [API.md](./API.md) for full API documentation.

| Endpoint | Description |
|----------|-------------|
| `/observatory/api/agents` | List all configured agents |
| `/observatory/api/channels` | List channels, accounts, and groups |
| `/observatory/api/sessions` | List all sessions across agents |
| `/observatory/api/transcript` | Get full conversation history |
| `/observatory/api/runs` | Get sub-agent run hierarchy |
| `/observatory/api/config` | Get sanitized runtime config |
| `/observatory/events` | SSE stream for live logs |

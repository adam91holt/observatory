import type { ClawdbotPluginApi, ClawdbotPluginHttpHandler } from 'clawdbot/plugin-sdk';
import { Tail } from 'tail';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';

export const id = 'observatory';

// Resolve the UI dist directory relative to this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIST = path.resolve(__dirname, '../ui/dist');

interface SessionRegistryEntry {
  sessionId: string;
  updatedAt: number;
  systemSent?: boolean;
  [key: string]: any;
}

interface AgentSessionSummary {
  agentId: string;
  sessionKey: string;
  sessionId: string;
  updatedAt: number;
}

export function register(api: ClawdbotPluginApi) {
  api.logger.info('🔭 Observatory API initializing...');

  // --- Cache for stats (60s TTL) ---
  let statsCache: { stats: any; timestamp: number } | null = null;
  const STATS_CACHE_TTL = 60000; // 60 seconds

  // --- Log Tailing (Live Firehose) --- 
  const connections = new Set<(line: string) => void>();
  let tail: Tail | null = null;

  const setupTail = () => {
    if (tail) return;
    let logFile = api.config.logging?.file;
    if (!logFile) {
      const date = new Date().toISOString().split('T')[0];
      logFile = `/tmp/clawdbot/clawdbot-${date}.log`;
    }

    if (!fs.existsSync(logFile)) {
      setTimeout(setupTail, 5000);
      return;
    }

    tail = new Tail(logFile);
    tail.on('line', (data: string) => {
      for (const send of connections) send(data);
    });
    tail.on('error', () => {
      tail?.unwatch();
      tail = null;
      setTimeout(setupTail, 5000);
    });
  };
  setupTail();

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

  // --- HTTP Handler ---
  const handler: ClawdbotPluginHttpHandler = async (req: IncomingMessage, res: ServerResponse) => {
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
      send(JSON.stringify({ type: 'system', message: 'Connected to Observatory API' }));
      req.on('close', () => connections.delete(send));
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
        // Try multiple locations for session files
        const sessionPaths = [
          path.join(os.homedir(), `.clawdbot/agents/${agent.id}/sessions/sessions.json`),
          path.join(agent.workspace, 'sessions/sessions.json'),
        ];
        
        for (const sessionFile of sessionPaths) {
          try {
            await fs.promises.access(sessionFile);
            const content = await fs.promises.readFile(sessionFile, 'utf-8');
            const sessions = JSON.parse(content);
            for (const [key, data] of Object.entries(sessions)) {
              const sessionData = data as SessionRegistryEntry;
              allSessions.push({
                agentId: agent.id,
                sessionKey: key,
                sessionId: sessionData.sessionId,
                updatedAt: sessionData.updatedAt
              });
            }
            break; // Found sessions, don't check other paths
          } catch (e: any) {
            if (e.code !== 'ENOENT') {
              api.logger.warn(`[observatory] Failed to read sessions for ${agent.id}: ${e}`);
            }
          }
        }
      }
      
      // Sort by recency
      allSessions.sort((a, b) => b.updatedAt - a.updatedAt);
      sendJson(res, { sessions: allSessions });
      return true;
    }

    // 4. GET /observatory/api/transcript?agentId=...&sessionId=...
    // Get full chat history for a specific session
    if (url.pathname === '/observatory/api/transcript') {
      const agentId = url.searchParams.get('agentId');
      const sessionId = url.searchParams.get('sessionId');

      if (!agentId || !sessionId) {
        sendError(res, 'Missing agentId or sessionId', 400);
        return true;
      }

      const agent = api.config.agents.list.find(a => a.id === agentId);
      if (!agent) {
        sendError(res, 'Agent not found', 404);
        return true;
      }

      // Try multiple locations for transcript files
      const transcriptPaths = [
        path.join(os.homedir(), `.clawdbot/agents/${agentId}/sessions/${sessionId}.jsonl`),
        path.join(agent.workspace, `sessions/${sessionId}.jsonl`),
      ];
      
      let found = false;
      for (const transcriptPath of transcriptPaths) {
        try {
          await fs.promises.access(transcriptPath);
          const content = await fs.promises.readFile(transcriptPath, 'utf-8');
          const messages = content.trim().split('\n')
            .map(line => {
              try { return JSON.parse(line); } catch (e) { return null; }
            })
            .filter(Boolean);
          
          sendJson(res, { messages });
          found = true;
          break;
        } catch (e: any) {
          if (e.code !== 'ENOENT') {
            sendError(res, `Failed to read transcript: ${e.message}`);
            return true;
          }
        }
      }
      
      if (!found) {
        sendError(res, 'Transcript not found', 404);
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
        sendJson(res, data);
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

        // Count sessions
        const sessionPaths = [
          path.join(os.homedir(), `.clawdbot/agents/${agent.id}/sessions/sessions.json`),
          path.join(agent.workspace, 'sessions/sessions.json'),
        ];

        for (const sessionFile of sessionPaths) {
          try {
            await fs.promises.access(sessionFile);
            const content = await fs.promises.readFile(sessionFile, 'utf-8');
            const sessions = JSON.parse(content);
            const sessionCount = Object.keys(sessions).length;
            agentStats.sessions = sessionCount;
            stats.totalSessions += sessionCount;

            // Process each session's transcript for costs
            for (const [, sessionData] of Object.entries(sessions)) {
              const data = sessionData as SessionRegistryEntry;
              
              // Try to read the transcript
              const transcriptPaths = [
                path.join(os.homedir(), `.clawdbot/agents/${agent.id}/sessions/${data.sessionId}.jsonl`),
                path.join(agent.workspace, `sessions/${data.sessionId}.jsonl`),
              ];

              for (const transcriptPath of transcriptPaths) {
                try {
                  await fs.promises.access(transcriptPath);
                  const transcriptContent = await fs.promises.readFile(transcriptPath, 'utf-8');
                  const lines = transcriptContent.trim().split('\n');
                  
                  for (const line of lines) {
                    try {
                      const entry = JSON.parse(line);
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
                    } catch (e) {
                      // Skip invalid lines
                    }
                  }
                  
                  break;
                } catch (e: any) {
                  if (e.code !== 'ENOENT') {
                    // Log error but continue
                  }
                }
              }
            }
            
            break;
          } catch (e: any) {
            if (e.code !== 'ENOENT') {
              // Continue to next path
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

        const sessionPaths = [
          path.join(os.homedir(), `.clawdbot/agents/${agent.id}/sessions/sessions.json`),
          path.join(agent.workspace, 'sessions/sessions.json'),
        ];

        for (const sessionFile of sessionPaths) {
          try {
            await fs.promises.access(sessionFile);
            const content = await fs.promises.readFile(sessionFile, 'utf-8');
            const sessions = JSON.parse(content);

            for (const [, sessionData] of Object.entries(sessions)) {
              const data = sessionData as SessionRegistryEntry;
              
              const transcriptPaths = [
                path.join(os.homedir(), `.clawdbot/agents/${agent.id}/sessions/${data.sessionId}.jsonl`),
                path.join(agent.workspace, `sessions/${data.sessionId}.jsonl`),
              ];

              for (const transcriptPath of transcriptPaths) {
                try {
                  await fs.promises.access(transcriptPath);
                  const transcriptContent = await fs.promises.readFile(transcriptPath, 'utf-8');
                  const lines = transcriptContent.trim().split('\n');
                  
                  let messageCount = 0;
                  for (const line of lines) {
                    try {
                      const entry = JSON.parse(line);
                      if (entry.type === 'message' && entry.message) {
                        const timestamp = entry.timestamp || 0;
                        
                        // Apply time range filter
                        if (rangeMs > 0 && timestamp < now - rangeMs) {
                          continue;
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
                    } catch (e) {
                      // Skip invalid lines
                    }
                  }

                  if (messageCount > 0) {
                    agentStats.sessions++;
                    baseStats.totalSessions++;
                    sessionLengths.push(messageCount);
                  }
                  
                  break;
                } catch (e: any) {
                  if (e.code !== 'ENOENT') {
                    // Continue
                  }
                }
              }
            }
            break;
          } catch (e: any) {
            if (e.code !== 'ENOENT') {
              // Continue
            }
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

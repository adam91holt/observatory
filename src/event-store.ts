// Import agent events types - these should be available from the SDK
type AgentEventStream = "lifecycle" | "tool" | "assistant" | "error" | (string & {});

type AgentEventPayload = {
  runId: string;
  seq: number;
  stream: AgentEventStream;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
};

export type StoredAgentEvent = AgentEventPayload & {
  id: string;
};

export interface EventStoreConfig {
  maxEvents?: number; // Default 5000 (increased for session preservation)
  maxAge?: number; // milliseconds, default 7 days (increased)
  maxSessionAge?: number; // milliseconds, default 30 days
}

export class AgentEventStore {
  private events: StoredAgentEvent[] = [];
  private eventsByRun = new Map<string, StoredAgentEvent[]>();
  private eventsBySession = new Map<string, StoredAgentEvent[]>();
  private activeSessions = new Set<string>(); // Track active sessions
  private sessionLastActivity = new Map<string, number>(); // Track last activity per session
  private completedSessions = new Set<string>(); // Sessions that have ended
  private config: Required<EventStoreConfig>;
  private nextId = 1;

  constructor(config?: EventStoreConfig) {
    this.config = {
      maxEvents: config?.maxEvents ?? 5000, // Increased to handle long sessions
      maxAge: config?.maxAge ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      maxSessionAge: config?.maxSessionAge ?? 30 * 24 * 60 * 60 * 1000, // 30 days
    };
  }

  add(event: AgentEventPayload): string {
    const id = `aevt-${this.nextId++}`;
    const stored: StoredAgentEvent = { ...event, id };

    this.events.push(stored);

    // Index by runId
    const runEvents = this.eventsByRun.get(event.runId) ?? [];
    runEvents.push(stored);
    this.eventsByRun.set(event.runId, runEvents);

    // Index by sessionKey if present
    if (event.sessionKey) {
      const sessionEvents = this.eventsBySession.get(event.sessionKey) ?? [];
      sessionEvents.push(stored);
      this.eventsBySession.set(event.sessionKey, sessionEvents);

      // Mark session as active and update last activity
      this.activeSessions.add(event.sessionKey);
      this.sessionLastActivity.set(event.sessionKey, event.ts);
    }

    // Prune old events
    this.prune();

    return id;
  }

  // Mark a session as completed (call this when session_end hook fires)
  markSessionCompleted(sessionKey: string): void {
    this.activeSessions.delete(sessionKey);
    this.completedSessions.add(sessionKey);
  }

  // Check if a session is still active (has events within last hour)
  private isSessionActive(sessionKey: string, now: number): boolean {
    if (this.completedSessions.has(sessionKey)) {
      return false;
    }

    const lastActivity = this.sessionLastActivity.get(sessionKey);
    if (!lastActivity) {
      return false;
    }

    // Consider active if has activity within last hour
    const ONE_HOUR = 60 * 60 * 1000;
    return (now - lastActivity) < ONE_HOUR;
  }

  getByRunId(runId: string): StoredAgentEvent[] {
    return this.eventsByRun.get(runId) ?? [];
  }

  getBySessionKey(sessionKey: string): StoredAgentEvent[] {
    return this.eventsBySession.get(sessionKey) ?? [];
  }

  getRecent(limit: number = 100): StoredAgentEvent[] {
    return this.events.slice(-limit);
  }

  getByStream(stream: string, limit: number = 100): StoredAgentEvent[] {
    return this.events.filter(e => e.stream === stream).slice(-limit);
  }

  getAll(): StoredAgentEvent[] {
    return [...this.events];
  }

  query(opts: {
    runId?: string;
    sessionKey?: string;
    stream?: string;
    since?: number;
    limit?: number;
  }): StoredAgentEvent[] {
    let results = [...this.events];

    if (opts.runId) {
      results = results.filter(e => e.runId === opts.runId);
    }

    if (opts.sessionKey) {
      results = results.filter(e => e.sessionKey === opts.sessionKey);
    }

    if (opts.stream) {
      results = results.filter(e => e.stream === opts.stream);
    }

    if (opts.since !== undefined) {
      results = results.filter(e => e.ts >= opts.since!);
    }

    if (opts.limit) {
      results = results.slice(-opts.limit);
    }

    return results;
  }

  private prune(): void {
    const now = Date.now();
    const cutoff = now - this.config.maxAge;
    const sessionCutoff = now - this.config.maxSessionAge;

    // CRITICAL: Preserve ALL events from active sessions
    // Only apply retention to completed/inactive sessions
    this.events = this.events.filter(e => {
      // Always keep events from active sessions
      if (e.sessionKey && this.isSessionActive(e.sessionKey, now)) {
        return true;
      }

      // For completed sessions, apply age-based retention
      // But use longer retention (maxSessionAge) for session data
      if (e.sessionKey && this.completedSessions.has(e.sessionKey)) {
        return e.ts >= sessionCutoff;
      }

      // For events without sessionKey, use standard retention
      return e.ts >= cutoff;
    });

    // If still over limit, remove oldest events from completed sessions only
    if (this.events.length > this.config.maxEvents) {
      // Separate active and inactive events
      const activeEvents: StoredAgentEvent[] = [];
      const inactiveEvents: StoredAgentEvent[] = [];

      for (const event of this.events) {
        if (event.sessionKey && this.isSessionActive(event.sessionKey, now)) {
          activeEvents.push(event);
        } else {
          inactiveEvents.push(event);
        }
      }

      // Keep all active session events, prune inactive
      const allowedInactive = Math.max(0, this.config.maxEvents - activeEvents.length);
      const prunedInactive = inactiveEvents.slice(-allowedInactive);

      this.events = [...activeEvents, ...prunedInactive].sort((a, b) => a.ts - b.ts);
    }

    // Rebuild indexes
    this.eventsByRun.clear();
    this.eventsBySession.clear();

    for (const event of this.events) {
      const runEvents = this.eventsByRun.get(event.runId) ?? [];
      runEvents.push(event);
      this.eventsByRun.set(event.runId, runEvents);

      if (event.sessionKey) {
        const sessionEvents = this.eventsBySession.get(event.sessionKey) ?? [];
        sessionEvents.push(event);
        this.eventsBySession.set(event.sessionKey, sessionEvents);
      }
    }

    // Clean up completed sessions that are too old
    for (const sessionKey of this.completedSessions) {
      const lastActivity = this.sessionLastActivity.get(sessionKey);
      if (lastActivity && (now - lastActivity) > this.config.maxSessionAge) {
        this.completedSessions.delete(sessionKey);
        this.sessionLastActivity.delete(sessionKey);
      }
    }
  }

  clear(): void {
    this.events = [];
    this.eventsByRun.clear();
    this.eventsBySession.clear();
  }

  getStats() {
    return {
      totalEvents: this.events.length,
      uniqueRuns: this.eventsByRun.size,
      uniqueSessions: this.eventsBySession.size,
      activeSessions: this.activeSessions.size,
      completedSessions: this.completedSessions.size,
      oldestEvent: this.events[0]?.ts,
      newestEvent: this.events[this.events.length - 1]?.ts,
    };
  }
}

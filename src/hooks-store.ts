// Storage for lifecycle hook events

export type HookEvent = {
  id: string;
  ts: number;
  hookName: string;
  context: Record<string, unknown>;
  event: Record<string, unknown>;
  result?: Record<string, unknown>;
};

export interface HooksStoreConfig {
  maxEvents?: number; // Default 2000
  maxAge?: number; // milliseconds, default 7 days
  maxSessionAge?: number; // milliseconds, default 30 days
}

export class HooksStore {
  private events: HookEvent[] = [];
  private eventsByHook = new Map<string, HookEvent[]>();
  private eventsBySession = new Map<string, HookEvent[]>();
  private activeSessions = new Set<string>();
  private sessionLastActivity = new Map<string, number>();
  private completedSessions = new Set<string>();
  private config: Required<HooksStoreConfig>;
  private nextId = 1;

  constructor(config?: HooksStoreConfig) {
    this.config = {
      maxEvents: config?.maxEvents ?? 2000,
      maxAge: config?.maxAge ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      maxSessionAge: config?.maxSessionAge ?? 30 * 24 * 60 * 60 * 1000, // 30 days
    };
  }

  add(hookName: string, context: Record<string, unknown>, event: Record<string, unknown>, result?: Record<string, unknown>): string {
    const id = `hook-${this.nextId++}`;
    const ts = Date.now();

    const stored: HookEvent = {
      id,
      ts,
      hookName,
      context,
      event,
      result,
    };

    this.events.push(stored);

    // Index by hook name
    const hookEvents = this.eventsByHook.get(hookName) ?? [];
    hookEvents.push(stored);
    this.eventsByHook.set(hookName, hookEvents);

    // Index by sessionKey if present
    const sessionKey = (context as any).sessionKey;
    if (sessionKey && typeof sessionKey === 'string') {
      const sessionEvents = this.eventsBySession.get(sessionKey) ?? [];
      sessionEvents.push(stored);
      this.eventsBySession.set(sessionKey, sessionEvents);

      // Track session activity
      this.activeSessions.add(sessionKey);
      this.sessionLastActivity.set(sessionKey, ts);
    }

    this.prune();
    return id;
  }

  markSessionCompleted(sessionKey: string): void {
    this.activeSessions.delete(sessionKey);
    this.completedSessions.add(sessionKey);
  }

  private isSessionActive(sessionKey: string, now: number): boolean {
    if (this.completedSessions.has(sessionKey)) {
      return false;
    }

    const lastActivity = this.sessionLastActivity.get(sessionKey);
    if (!lastActivity) {
      return false;
    }

    const ONE_HOUR = 60 * 60 * 1000;
    return (now - lastActivity) < ONE_HOUR;
  }

  getByHook(hookName: string, limit?: number): HookEvent[] {
    const events = this.eventsByHook.get(hookName) ?? [];
    return limit ? events.slice(-limit) : events;
  }

  getBySession(sessionKey: string, limit?: number): HookEvent[] {
    const events = this.eventsBySession.get(sessionKey) ?? [];
    return limit ? events.slice(-limit) : events;
  }

  getRecent(limit: number = 50): HookEvent[] {
    return this.events.slice(-limit);
  }

  getAll(): HookEvent[] {
    return [...this.events];
  }

  query(opts: {
    hookName?: string;
    sessionKey?: string;
    since?: number;
    limit?: number;
  }): HookEvent[] {
    let results = [...this.events];

    if (opts.hookName) {
      results = results.filter(e => e.hookName === opts.hookName);
    }

    if (opts.sessionKey) {
      results = results.filter(e => (e.context as any).sessionKey === opts.sessionKey);
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

    // Preserve events from active sessions
    this.events = this.events.filter(e => {
      const sessionKey = (e.context as any).sessionKey;

      if (sessionKey && typeof sessionKey === 'string' && this.isSessionActive(sessionKey, now)) {
        return true;
      }

      if (sessionKey && this.completedSessions.has(sessionKey)) {
        return e.ts >= sessionCutoff;
      }

      return e.ts >= cutoff;
    });

    // If over limit, prune from completed sessions only
    if (this.events.length > this.config.maxEvents) {
      const activeEvents: HookEvent[] = [];
      const inactiveEvents: HookEvent[] = [];

      for (const event of this.events) {
        const sessionKey = (event.context as any).sessionKey;
        if (sessionKey && typeof sessionKey === 'string' && this.isSessionActive(sessionKey, now)) {
          activeEvents.push(event);
        } else {
          inactiveEvents.push(event);
        }
      }

      const allowedInactive = Math.max(0, this.config.maxEvents - activeEvents.length);
      const prunedInactive = inactiveEvents.slice(-allowedInactive);

      this.events = [...activeEvents, ...prunedInactive].sort((a, b) => a.ts - b.ts);
    }

    // Rebuild indexes
    this.eventsByHook.clear();
    this.eventsBySession.clear();

    for (const event of this.events) {
      const hookEvents = this.eventsByHook.get(event.hookName) ?? [];
      hookEvents.push(event);
      this.eventsByHook.set(event.hookName, hookEvents);

      const sessionKey = (event.context as any).sessionKey;
      if (sessionKey && typeof sessionKey === 'string') {
        const sessionEvents = this.eventsBySession.get(sessionKey) ?? [];
        sessionEvents.push(event);
        this.eventsBySession.set(sessionKey, sessionEvents);
      }
    }

    // Clean up old completed sessions
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
    this.eventsByHook.clear();
    this.eventsBySession.clear();
  }

  getStats() {
    const hookCounts: Record<string, number> = {};
    for (const [hookName, events] of this.eventsByHook) {
      hookCounts[hookName] = events.length;
    }

    return {
      totalEvents: this.events.length,
      uniqueHooks: this.eventsByHook.size,
      uniqueSessions: this.eventsBySession.size,
      hookCounts,
      oldestEvent: this.events[0]?.ts,
      newestEvent: this.events[this.events.length - 1]?.ts,
    };
  }
}

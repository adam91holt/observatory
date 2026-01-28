import type { DiagnosticEventPayload } from 'clawdbot/plugin-sdk';

export type StoredDiagnosticEvent = DiagnosticEventPayload & {
  id: string;
};

export interface DiagnosticsStoreConfig {
  maxEvents?: number; // Default 5000
  maxAge?: number; // milliseconds, default 7 days
  maxSessionAge?: number; // milliseconds, default 30 days
}

export class DiagnosticsStore {
  private events: StoredDiagnosticEvent[] = [];
  private eventsByType = new Map<string, StoredDiagnosticEvent[]>();
  private activeSessions = new Set<string>();
  private sessionLastActivity = new Map<string, number>();
  private completedSessions = new Set<string>();
  private config: Required<DiagnosticsStoreConfig>;
  private nextId = 1;

  constructor(config?: DiagnosticsStoreConfig) {
    this.config = {
      maxEvents: config?.maxEvents ?? 5000,
      maxAge: config?.maxAge ?? 7 * 24 * 60 * 60 * 1000, // 7 days
      maxSessionAge: config?.maxSessionAge ?? 30 * 24 * 60 * 60 * 1000, // 30 days
    };
  }

  add(event: DiagnosticEventPayload): string {
    const id = `devt-${this.nextId++}`;
    const stored: StoredDiagnosticEvent = { ...event, id };

    this.events.push(stored);

    // Index by type
    const typeEvents = this.eventsByType.get(event.type) ?? [];
    typeEvents.push(stored);
    this.eventsByType.set(event.type, typeEvents);

    // Track session activity if present
    const sessionKey = (event as any).sessionKey;
    if (sessionKey && typeof sessionKey === 'string') {
      this.activeSessions.add(sessionKey);
      this.sessionLastActivity.set(sessionKey, event.ts);
    }

    // Prune old events
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

  getByType(type: string, limit?: number): StoredDiagnosticEvent[] {
    const events = this.eventsByType.get(type) ?? [];
    return limit ? events.slice(-limit) : events;
  }

  getRecent(limit: number = 100): StoredDiagnosticEvent[] {
    return this.events.slice(-limit);
  }

  getAll(): StoredDiagnosticEvent[] {
    return [...this.events];
  }

  query(opts: {
    type?: string;
    sessionKey?: string;
    channel?: string;
    since?: number;
    limit?: number;
  }): StoredDiagnosticEvent[] {
    let results = [...this.events];

    if (opts.type) {
      results = results.filter(e => e.type === opts.type);
    }

    if (opts.sessionKey) {
      results = results.filter(e => 'sessionKey' in e && e.sessionKey === opts.sessionKey);
    }

    if (opts.channel) {
      results = results.filter(e => 'channel' in e && e.channel === opts.channel);
    }

    if (opts.since !== undefined) {
      results = results.filter(e => e.ts >= opts.since!);
    }

    if (opts.limit) {
      results = results.slice(-opts.limit);
    }

    return results;
  }

  getSummary() {
    const summary: Record<string, number> = {};
    for (const [type, events] of this.eventsByType) {
      summary[type] = events.length;
    }
    return summary;
  }

  private prune(): void {
    const now = Date.now();
    const cutoff = now - this.config.maxAge;
    const sessionCutoff = now - this.config.maxSessionAge;

    // Preserve events from active sessions
    this.events = this.events.filter(e => {
      const sessionKey = (e as any).sessionKey;

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
      const activeEvents: StoredDiagnosticEvent[] = [];
      const inactiveEvents: StoredDiagnosticEvent[] = [];

      for (const event of this.events) {
        const sessionKey = (event as any).sessionKey;
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

    // Rebuild type index
    this.eventsByType.clear();

    for (const event of this.events) {
      const typeEvents = this.eventsByType.get(event.type) ?? [];
      typeEvents.push(event);
      this.eventsByType.set(event.type, typeEvents);
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
    this.eventsByType.clear();
  }

  getStats() {
    const types = Object.keys(this.getSummary());
    return {
      totalEvents: this.events.length,
      uniqueTypes: types.length,
      types,
      oldestEvent: this.events[0]?.ts,
      newestEvent: this.events[this.events.length - 1]?.ts,
    };
  }
}

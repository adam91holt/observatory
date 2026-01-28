// Heartbeat event types
type HeartbeatIndicatorType = "ok" | "alert" | "error";

type HeartbeatEventPayload = {
  ts: number;
  status: "sent" | "ok-empty" | "ok-token" | "skipped" | "failed";
  to?: string;
  preview?: string;
  durationMs?: number;
  hasMedia?: boolean;
  reason?: string;
  channel?: string;
  silent?: boolean;
  indicatorType?: HeartbeatIndicatorType;
};

export type StoredHeartbeatEvent = HeartbeatEventPayload & {
  id: string;
};

export interface HeartbeatTrackerConfig {
  maxEvents?: number; // Default 100
  maxAge?: number; // milliseconds, default 7 days
}

export class HeartbeatTracker {
  private events: StoredHeartbeatEvent[] = [];
  private config: Required<HeartbeatTrackerConfig>;
  private nextId = 1;

  constructor(config?: HeartbeatTrackerConfig) {
    this.config = {
      maxEvents: config?.maxEvents ?? 100,
      maxAge: config?.maxAge ?? 7 * 24 * 60 * 60 * 1000, // 7 days
    };
  }

  add(event: HeartbeatEventPayload): string {
    const id = `hevt-${this.nextId++}`;
    const stored: StoredHeartbeatEvent = { ...event, id };

    this.events.push(stored);
    this.prune();

    return id;
  }

  getRecent(limit: number = 20): StoredHeartbeatEvent[] {
    return this.events.slice(-limit);
  }

  getAll(): StoredHeartbeatEvent[] {
    return [...this.events];
  }

  getLastEvent(): StoredHeartbeatEvent | null {
    return this.events[this.events.length - 1] ?? null;
  }

  getSuccessRate(lookback: number = 10): number {
    const recent = this.events.slice(-lookback);
    if (recent.length === 0) return 1.0;

    const successful = recent.filter(e =>
      e.status === 'ok-empty' || e.status === 'ok-token' || e.status === 'sent'
    ).length;

    return successful / recent.length;
  }

  getConsecutiveFailures(): number {
    let count = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].status === 'failed') {
        count++;
      } else {
        break;
      }
    }
    return count;
  }

  query(opts: {
    status?: HeartbeatEventPayload['status'];
    channel?: string;
    since?: number;
    limit?: number;
  }): StoredHeartbeatEvent[] {
    let results = [...this.events];

    if (opts.status) {
      results = results.filter(e => e.status === opts.status);
    }

    if (opts.channel) {
      results = results.filter(e => e.channel === opts.channel);
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

    // Remove by age
    this.events = this.events.filter(e => e.ts >= cutoff);

    // Remove by count
    if (this.events.length > this.config.maxEvents) {
      const excess = this.events.length - this.config.maxEvents;
      this.events = this.events.slice(excess);
    }
  }

  clear(): void {
    this.events = [];
  }

  getStats() {
    const statusCounts: Record<string, number> = {};
    for (const event of this.events) {
      statusCounts[event.status] = (statusCounts[event.status] ?? 0) + 1;
    }

    return {
      totalEvents: this.events.length,
      successRate: this.getSuccessRate(),
      consecutiveFailures: this.getConsecutiveFailures(),
      statusCounts,
      oldestEvent: this.events[0]?.ts,
      newestEvent: this.events[this.events.length - 1]?.ts,
    };
  }
}

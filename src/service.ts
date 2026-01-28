import type { MoltbotPluginServiceContext } from 'clawdbot/plugin-sdk';
import type { AgentEventStore } from './event-store.js';
import type { DiagnosticsStore } from './diagnostics-store.js';
import type { HeartbeatTracker } from './heartbeat-tracker.js';
import type { HooksStore } from './hooks-store.js';
import fs from 'fs/promises';
import path from 'path';

export type AggregatedMetrics = {
  timestamp: number;
  interval: 'minute' | 'hour' | 'day';
  agentEvents: {
    totalEvents: number;
    byStream: Record<string, number>;
    uniqueRuns: number;
    uniqueSessions: number;
  };
  diagnostics: {
    totalEvents: number;
    byType: Record<string, number>;
  };
  heartbeats: {
    totalEvents: number;
    successRate: number;
    consecutiveFailures: number;
  };
  hooks: {
    totalEvents: number;
    byHook: Record<string, number>;
  };
};

export class ObservatoryService {
  private intervalHandle?: NodeJS.Timeout;
  private metricsHistory: AggregatedMetrics[] = [];
  private maxMetricsHistory = 1000;

  constructor(
    private ctx: MoltbotPluginServiceContext,
    private stores: {
      agentEventStore: AgentEventStore;
      diagnosticsStore: DiagnosticsStore;
      heartbeatTracker: HeartbeatTracker;
      hooksStore: HooksStore;
    },
  ) {}

  async start(): Promise<void> {
    this.ctx.logger.info('🔭 Observatory service starting...');

    // Run aggregation every 60 seconds
    this.intervalHandle = setInterval(() => {
      this.aggregateMetrics();
    }, 60 * 1000);

    // Don't block on ref
    this.intervalHandle.unref?.();

    // Run initial aggregation
    await this.aggregateMetrics();

    // Load persisted metrics
    await this.loadMetrics();

    this.ctx.logger.info('🔭 Observatory service started');
  }

  async stop(): Promise<void> {
    this.ctx.logger.info('🔭 Observatory service stopping...');

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }

    // Persist metrics before stopping
    await this.persistMetrics();

    this.ctx.logger.info('🔭 Observatory service stopped');
  }

  private async aggregateMetrics(): Promise<void> {
    try {
      const agentStats = this.stores.agentEventStore.getStats();
      const agentEvents = this.stores.agentEventStore.getAll();
      const diagnosticsStats = this.stores.diagnosticsStore.getStats();
      const diagnosticsSummary = this.stores.diagnosticsStore.getSummary();
      const heartbeatStats = this.stores.heartbeatTracker.getStats();
      const hooksStats = this.stores.hooksStore.getStats();

      // Compute stream breakdown for agent events
      const byStream: Record<string, number> = {};
      for (const event of agentEvents) {
        byStream[event.stream] = (byStream[event.stream] ?? 0) + 1;
      }

      const metrics: AggregatedMetrics = {
        timestamp: Date.now(),
        interval: 'minute', // Could be enhanced to support hour/day
        agentEvents: {
          totalEvents: agentStats.totalEvents,
          byStream,
          uniqueRuns: agentStats.uniqueRuns,
          uniqueSessions: agentStats.uniqueSessions,
        },
        diagnostics: {
          totalEvents: diagnosticsStats.totalEvents,
          byType: diagnosticsSummary,
        },
        heartbeats: {
          totalEvents: heartbeatStats.totalEvents,
          successRate: heartbeatStats.successRate,
          consecutiveFailures: heartbeatStats.consecutiveFailures,
        },
        hooks: {
          totalEvents: hooksStats.totalEvents,
          byHook: hooksStats.hookCounts,
        },
      };

      this.metricsHistory.push(metrics);

      // Prune old metrics
      if (this.metricsHistory.length > this.maxMetricsHistory) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxMetricsHistory);
      }

      this.ctx.logger.debug?.(`🔭 Observatory: aggregated metrics (${agentStats.totalEvents} agent events, ${diagnosticsStats.totalEvents} diagnostic events)`);
    } catch (error) {
      this.ctx.logger.warn(`🔭 Observatory: failed to aggregate metrics: ${error}`);
    }
  }

  private async loadMetrics(): Promise<void> {
    try {
      const metricsPath = path.join(this.ctx.stateDir, 'observatory-metrics.json');
      const content = await fs.readFile(metricsPath, 'utf-8');
      const data = JSON.parse(content);

      if (Array.isArray(data.metrics)) {
        this.metricsHistory = data.metrics;
        this.ctx.logger.debug?.(`🔭 Observatory: loaded ${this.metricsHistory.length} metrics snapshots`);
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        this.ctx.logger.warn?.(`🔭 Observatory: failed to load metrics: ${error}`);
      }
    }
  }

  private async persistMetrics(): Promise<void> {
    try {
      const metricsPath = path.join(this.ctx.stateDir, 'observatory-metrics.json');
      const data = {
        version: 1,
        savedAt: Date.now(),
        metrics: this.metricsHistory,
      };

      await fs.writeFile(metricsPath, JSON.stringify(data, null, 2));
      this.ctx.logger.debug?.(`🔭 Observatory: persisted ${this.metricsHistory.length} metrics snapshots`);
    } catch (error) {
      this.ctx.logger.warn?.(`🔭 Observatory: failed to persist metrics: ${error}`);
    }
  }

  getMetricsHistory(limit?: number): AggregatedMetrics[] {
    if (limit) {
      return this.metricsHistory.slice(-limit);
    }
    return [...this.metricsHistory];
  }

  getLatestMetrics(): AggregatedMetrics | null {
    return this.metricsHistory[this.metricsHistory.length - 1] ?? null;
  }
}

/**
 * Gateway Connection State Store
 *
 * Zustand store that mirrors the WebSocket client's connection state
 * and snapshot data, making it reactive for React components.
 *
 * Issue: #30 WebSocket Client Integration
 */

import { create } from 'zustand'
import type {
  ConnectionState,
  GatewaySnapshot,
  HealthSnapshot,
  PresenceEntry,
} from '@/lib/websocket'

// ---------------------------------------------------------------------------
//  State shape
// ---------------------------------------------------------------------------

export interface GatewayState {
  // Connection
  connectionState: ConnectionState
  reconnectAttempts: number

  // Snapshot data (updated in real-time via events)
  snapshot: GatewaySnapshot | null
  health: HealthSnapshot | null
  presence: PresenceEntry[]
  uptimeMs: number

  // Derived booleans
  isConnected: boolean
  isHealthy: boolean

  // Actions
  setConnectionState: (state: ConnectionState) => void
  setReconnectAttempts: (count: number) => void
  setSnapshot: (snapshot: GatewaySnapshot) => void
  updateHealth: (health: HealthSnapshot) => void
  updatePresence: (entries: PresenceEntry[]) => void
  reset: () => void
}

// ---------------------------------------------------------------------------
//  Initial state
// ---------------------------------------------------------------------------

const INITIAL_STATE = {
  connectionState: 'disconnected' as ConnectionState,
  reconnectAttempts: 0,
  snapshot: null,
  health: null,
  presence: [] as PresenceEntry[],
  uptimeMs: 0,
  isConnected: false,
  isHealthy: false,
}

// ---------------------------------------------------------------------------
//  Store
// ---------------------------------------------------------------------------

export const useGatewayStore = create<GatewayState>((set) => ({
  ...INITIAL_STATE,

  setConnectionState: (connectionState) =>
    set({
      connectionState,
      isConnected: connectionState === 'connected',
    }),

  setReconnectAttempts: (reconnectAttempts) =>
    set({ reconnectAttempts }),

  setSnapshot: (snapshot) =>
    set({
      snapshot,
      health: snapshot.health,
      presence: snapshot.presence,
      uptimeMs: snapshot.uptimeMs,
      isHealthy: snapshot.health.status === 'healthy',
    }),

  updateHealth: (health) =>
    set((state) => ({
      health,
      isHealthy: health.status === 'healthy',
      snapshot: state.snapshot
        ? { ...state.snapshot, health }
        : null,
    })),

  updatePresence: (entries) =>
    set((state) => ({
      presence: entries,
      snapshot: state.snapshot
        ? { ...state.snapshot, presence: entries }
        : null,
    })),

  reset: () => set(INITIAL_STATE),
}))

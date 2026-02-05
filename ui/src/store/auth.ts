/**
 * Authentication Store for Observatory
 * Manages Gateway token authentication with secure storage
 * Issue: #26 Authentication System
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getWebSocketClient, resetWebSocketClient, type GatewaySnapshot, type ConnectionState } from '@/lib/websocket'

export interface AuthState {
  // Auth status
  isAuthenticated: boolean
  isConnecting: boolean
  connectionState: ConnectionState

  // Gateway info
  gatewayUrl: string
  gatewaySnapshot: GatewaySnapshot | null

  // Tailscale identity (auto-auth)
  tailscaleUser: string | null

  // Error state
  error: string | null

  // Actions
  setGatewayUrl: (url: string) => void
  login: (token: string) => Promise<boolean>
  logout: () => void
  checkConnection: () => Promise<boolean>
  checkTailscaleAuth: () => Promise<boolean>
  clearError: () => void
}

// Store token in localStorage with a namespaced key
// For single-user self-hosted MVP, localStorage is acceptable
// Token is already a secret the user possesses; storing it avoids re-entry on refresh
const TOKEN_STORAGE_KEY = 'observatory-gateway-token'

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

function storeToken(token: string) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token)
  } catch (error) {
    console.warn('Failed to store token:', error)
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Ignore
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      isAuthenticated: false,
      isConnecting: false,
      connectionState: 'disconnected' as ConnectionState,
      gatewayUrl: 'ws://127.0.0.1:18789',
      gatewaySnapshot: null,
      tailscaleUser: null,
      error: null,

      setGatewayUrl: (url: string) => {
        set({ gatewayUrl: url })
      },

      login: async (token: string) => {
        const { gatewayUrl } = get()

        if (!gatewayUrl) {
          set({ error: 'Gateway URL is required' })
          return false
        }

        set({ isConnecting: true, error: null })

        try {
          const wsClient = getWebSocketClient()

          const snapshot = await wsClient.connect({
            url: gatewayUrl,
            token: token || undefined,
            clientId: 'observatory-dashboard',
            clientVersion: '1.0.0',
            onStateChange: (state: ConnectionState) => {
              set({ connectionState: state })

              if (state === 'error' || state === 'disconnected') {
                set({ isAuthenticated: false })
              }
            },
            onEvent: (event, payload) => {
              const currentSnapshot = get().gatewaySnapshot
              if (!currentSnapshot) return

              if (event === 'health' && payload) {
                set({
                  gatewaySnapshot: {
                    ...currentSnapshot,
                    health: payload as GatewaySnapshot['health'],
                  },
                })
              } else if (event === 'presence') {
                const presencePayload = payload as { entries?: GatewaySnapshot['presence'] }
                if (presencePayload?.entries) {
                  set({
                    gatewaySnapshot: {
                      ...currentSnapshot,
                      presence: presencePayload.entries,
                    },
                  })
                }
              }
            },
            onSnapshot: (snapshot: GatewaySnapshot) => {
              set({ gatewaySnapshot: snapshot })
            },
            onError: (error: Error) => {
              console.error('[Auth] WebSocket error:', error)
              set({ error: error.message })
            },
          })

          // Persist token for session restoration
          if (token) {
            storeToken(token)
          }

          set({
            isAuthenticated: true,
            isConnecting: false,
            gatewaySnapshot: snapshot,
            connectionState: 'connected',
          })

          return true
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Connection failed'
          set({
            isAuthenticated: false,
            isConnecting: false,
            error: message,
            connectionState: 'error',
          })
          return false
        }
      },

      logout: () => {
        resetWebSocketClient()
        clearStoredToken()
        set({
          isAuthenticated: false,
          connectionState: 'disconnected',
          gatewaySnapshot: null,
          tailscaleUser: null,
          error: null,
        })
      },

      checkConnection: async () => {
        const token = getStoredToken()
        const { gatewayUrl, isAuthenticated } = get()

        // Already connected
        const wsClient = getWebSocketClient()
        if (wsClient.isConnected && isAuthenticated) {
          return true
        }

        if (!gatewayUrl) {
          return false
        }

        // Try Tailscale auto-auth first
        const tailscaleOk = await get().checkTailscaleAuth()
        if (tailscaleOk) {
          return true
        }

        // Try to reconnect with stored token
        if (token) {
          return get().login(token)
        }

        // Try tokenless connection (localhost)
        return get().login('')
      },

      checkTailscaleAuth: async () => {
        try {
          // Probe for Tailscale identity header via a lightweight HTTP endpoint
          // When behind Tailscale Serve/Funnel, the proxy injects Tailscale-User-Login
          const { gatewayUrl } = get()
          if (!gatewayUrl) return false

          // Derive HTTP URL from WS URL for the health check
          const httpUrl = gatewayUrl
            .replace(/^ws:/, 'http:')
            .replace(/^wss:/, 'https:')

          const response = await fetch(`${httpUrl}/health`, {
            credentials: 'include',
          })

          const tsUser = response.headers.get('Tailscale-User-Login')
            || response.headers.get('X-Tailscale-User-Login')

          if (tsUser) {
            set({ tailscaleUser: tsUser })
            // Auto-login without token — the proxy authenticates us
            return get().login('')
          }

          return false
        } catch {
          // Tailscale not available, that's fine
          return false
        }
      },

      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: 'observatory-auth',
      // Only persist gatewayUrl, not auth state or tokens
      partialize: (state) => ({
        gatewayUrl: state.gatewayUrl,
      }),
    }
  )
)

// Hook to use WebSocket client with auth
export function useGatewayClient() {
  const { isAuthenticated, connectionState } = useAuthStore()
  const wsClient = getWebSocketClient()

  return {
    client: isAuthenticated ? wsClient : null,
    isConnected: connectionState === 'connected',
    state: connectionState,
  }
}

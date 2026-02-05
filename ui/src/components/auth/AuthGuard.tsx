/**
 * Auth Guard Component
 * Protects routes that require authentication
 * Supports auto-reconnection via stored token and Tailscale identity
 * Issue: #26 Authentication System
 */

import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, Waves } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation()
  const { isAuthenticated, isConnecting, checkConnection } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      if (!isAuthenticated) {
        await checkConnection()
      }
      if (!cancelled) {
        setIsChecking(false)
      }
    }
    check()

    return () => {
      cancelled = true
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // Run once on mount — intentionally omit deps to avoid re-triggering

  // Show loading while checking stored credentials
  if (isChecking || isConnecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
            <Waves className="h-6 w-6 text-primary" />
          </div>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Connecting to Gateway…</p>
          </div>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}

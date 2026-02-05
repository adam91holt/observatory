/**
 * Auth Guard Component
 * Protects routes that require authentication
 * Issue: #26 Authentication System
 */

import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/auth'

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const location = useLocation()
  const { isAuthenticated, isConnecting, checkConnection } = useAuthStore()
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    const check = async () => {
      if (!isAuthenticated) {
        await checkConnection()
      }
      setIsChecking(false)
    }
    check()
  }, [isAuthenticated, checkConnection])

  // Show loading while checking stored credentials
  if (isChecking || isConnecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Connecting to Gateway...</p>
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

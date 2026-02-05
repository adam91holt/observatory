/**
 * Login Page for Observatory
 * Gateway token authentication interface
 * Issue: #26 Authentication System
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Loader2, AlertCircle, Waves, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth'
import { useThemeStore, applyTheme } from '@/store/theme'

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { theme } = useThemeStore()

  const {
    isAuthenticated,
    isConnecting,
    gatewayUrl,
    error,
    setGatewayUrl,
    login,
    clearError,
  } = useAuthStore()

  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [localUrl, setLocalUrl] = useState(gatewayUrl || 'ws://127.0.0.1:18789')

  // Apply theme on mount
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    clearError()

    // Sync the advanced URL if user changed it
    if (localUrl.trim() !== gatewayUrl) {
      setGatewayUrl(localUrl.trim())
    }

    const success = await login(token.trim())
    if (success) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/'
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Waves className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">The Reef</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Agent Mission Control
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Token input */}
              <div className="space-y-2">
                <label htmlFor="token" className="text-sm font-medium">
                  Gateway Token
                </label>
                <div className="relative">
                  <Input
                    id="token"
                    type={showToken ? 'text' : 'password'}
                    placeholder="Enter your gateway token"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    className="pr-10"
                    disabled={isConnecting}
                    autoComplete="off"
                    autoFocus
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
                    onClick={() => setShowToken(!showToken)}
                    tabIndex={-1}
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Optional for localhost connections
                </p>
              </div>

              {/* Advanced options toggle */}
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                {showAdvanced ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                Advanced options
              </button>

              {/* Advanced: Gateway URL */}
              {showAdvanced && (
                <div className="space-y-2">
                  <label htmlFor="gatewayUrl" className="text-sm font-medium">
                    Gateway URL
                  </label>
                  <Input
                    id="gatewayUrl"
                    type="text"
                    placeholder="ws://127.0.0.1:18789"
                    value={localUrl}
                    onChange={(e) => setLocalUrl(e.target.value)}
                    disabled={isConnecting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Default: ws://127.0.0.1:18789
                  </p>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="flex items-center gap-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                className="w-full"
                disabled={isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting…
                  </>
                ) : (
                  'Connect'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Help text */}
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Token is set via{' '}
          <code className="rounded bg-muted px-1 py-0.5">gateway.auth.token</code>
          {' '}in your OpenClaw config
        </p>
      </div>
    </div>
  )
}

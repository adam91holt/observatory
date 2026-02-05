/**
 * ClearSessionButton — Clear/reset an agent's session
 *
 * Two-phase confirmation pattern (same as AbortButton):
 *   1. Click once → shows confirmation dialog
 *   2. Confirm → sends session.clear RPC
 *   3. Shows success/error toast
 *
 * Disabled when no active session is selected.
 *
 * Issue: #25 Clear Session
 */

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useGatewayClient } from '@/store/auth'

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type ClearPhase = 'idle' | 'confirming' | 'clearing' | 'done'

export interface ClearSessionButtonProps {
  /** Session key to clear */
  sessionKey: string
  /** Whether a session is active / selected */
  hasSession: boolean
  /** Optional callback after successful clear */
  onCleared?: () => void
  /** Additional class names */
  className?: string
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function ClearSessionButton({
  sessionKey,
  hasSession,
  onCleared,
  className,
}: ClearSessionButtonProps) {
  const [phase, setPhase] = useState<ClearPhase>('idle')
  const { client } = useGatewayClient()
  const { toast } = useToast()

  // -----------------------------------------------------------------------
  //  Clear logic
  // -----------------------------------------------------------------------

  const doClear = useCallback(async () => {
    if (!client) {
      toast({ title: 'Not connected to Gateway', variant: 'error' })
      return
    }

    setPhase('clearing')

    try {
      await client.request('session.clear', { sessionKey })
      setPhase('done')
      toast({
        title: 'Session cleared',
        description: `Session ${sessionKey} has been reset`,
        variant: 'success',
      })
      onCleared?.()
      // Return to idle after brief success flash
      setTimeout(() => setPhase('idle'), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Clear failed'
      setPhase('idle')
      toast({ title: 'Clear failed', description: message, variant: 'error' })
    }
  }, [client, sessionKey, toast, onCleared])

  const handleClick = useCallback(() => {
    if (!hasSession) return

    if (phase === 'idle') {
      setPhase('confirming')
    }
  }, [phase, hasSession])

  const handleConfirm = useCallback(() => {
    void doClear()
  }, [doClear])

  const handleCancel = useCallback(() => {
    setPhase('idle')
  }, [])

  // -----------------------------------------------------------------------
  //  Render
  // -----------------------------------------------------------------------

  const isDisabled = !hasSession || phase === 'clearing' || phase === 'done'

  // Confirmation dialog overlay
  if (phase === 'confirming') {
    return (
      <div className={cn('relative inline-flex items-center gap-1.5', className)}>
        {/* Backdrop click to cancel */}
        <div className="fixed inset-0 z-40" onClick={handleCancel} />

        {/* Confirmation popup */}
        <div
          className={cn(
            'absolute bottom-full left-0 mb-2 z-50',
            'min-w-[240px] rounded-lg border border-amber-500/30',
            'bg-amber-950/95 backdrop-blur-sm shadow-lg shadow-black/20',
            'p-3 animate-in fade-in slide-in-from-bottom-2 duration-150',
          )}
        >
          <div className="flex items-start gap-2 mb-3">
            <WarningIcon />
            <div>
              <p className="text-sm font-medium text-amber-100">
                Clear this session?
              </p>
              <p className="text-xs text-amber-300/70 mt-0.5">
                This will reset the conversation history. This cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancel}
              className="h-7 px-2.5 text-xs text-amber-300 hover:text-amber-100 hover:bg-amber-800/40"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleConfirm}
              className="h-7 px-2.5 text-xs bg-red-600 hover:bg-red-500 text-white"
            >
              Clear Session
            </Button>
          </div>
        </div>

        {/* The original button (stays visible behind dialog) */}
        <Button
          variant="outline"
          size="sm"
          disabled
          className={cn(
            'bg-amber-900/40 border-amber-600/40 text-amber-300',
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <TrashIcon />
            <span className="text-xs font-medium">Clear Session</span>
          </span>
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isDisabled}
      onClick={handleClick}
      className={cn(
        'relative select-none transition-all duration-200',
        phase === 'idle' && hasSession && [
          'bg-transparent border border-border text-muted-foreground',
          'hover:bg-amber-900/30 hover:border-amber-600/40 hover:text-amber-300',
        ],
        phase === 'clearing' && [
          'bg-amber-900/40 border-amber-600/40 text-amber-300 cursor-wait',
        ],
        phase === 'done' && [
          'bg-emerald-800/60 text-emerald-300 border border-emerald-600/40',
        ],
        !hasSession && 'opacity-40 cursor-not-allowed',
        className,
      )}
      title={
        !hasSession
          ? 'No active session'
          : phase === 'idle'
            ? 'Clear session history'
            : phase === 'clearing'
              ? 'Clearing...'
              : 'Cleared'
      }
    >
      <span className="inline-flex items-center gap-1.5">
        {phase === 'clearing' ? (
          <ClearSpinner />
        ) : phase === 'done' ? (
          <CheckIcon />
        ) : (
          <TrashIcon />
        )}
        <span className="text-xs font-medium">
          {phase === 'idle' && 'Clear Session'}
          {phase === 'clearing' && 'Clearing…'}
          {phase === 'done' && 'Cleared'}
        </span>
      </span>
    </Button>
  )
}

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M2.5 3.5h9" />
      <path d="M5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1" />
      <path d="M10.5 3.5l-.5 8a1 1 0 01-1 1H5a1 1 0 01-1-1l-.5-8" />
      <path d="M5.5 6v4" />
      <path d="M8.5 6v4" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <polyline points="3,7 6,10 11,4" />
    </svg>
  )
}

function ClearSpinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="shrink-0 animate-spin"
    >
      <circle
        cx="7"
        cy="7"
        r="5"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="20"
        strokeDashoffset="10"
        strokeLinecap="round"
      />
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="shrink-0 mt-0.5 text-amber-400"
    >
      <path
        d="M8 1.5L14.5 13H1.5L8 1.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M8 6v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.75" fill="currentColor" />
    </svg>
  )
}

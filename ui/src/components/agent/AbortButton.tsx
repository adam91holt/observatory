/**
 * AbortButton — Abort/Stop control for agent runs
 *
 * Two-click confirmation pattern:
 *   1. Click once → button arms (turns red, shows "Confirm Abort")
 *   2. Click again within 3s → sends chat.abort
 *   3. If no second click → disarms after 3s timeout
 *
 * Keyboard shortcut: Ctrl+Shift+X (arms on first press, aborts on second)
 *
 * Issue: #24 Abort Run (Basic Agent Control)
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useGatewayClient } from '@/store/auth'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type AbortPhase = 'idle' | 'armed' | 'aborting' | 'done'

export interface AbortButtonProps {
  /** Session key to abort */
  sessionKey: string
  /** Whether the session has an active run */
  hasActiveRun: boolean
  /** Optional callback after successful abort */
  onAborted?: () => void
  /** Additional class names */
  className?: string
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const ARM_TIMEOUT_MS = 3000

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function AbortButton({
  sessionKey,
  hasActiveRun,
  onAborted,
  className,
}: AbortButtonProps) {
  const [phase, setPhase] = useState<AbortPhase>('idle')
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { client } = useGatewayClient()
  const { toast } = useToast()

  // Clear arm timer on unmount
  useEffect(() => {
    return () => {
      if (armTimerRef.current) clearTimeout(armTimerRef.current)
    }
  }, [])

  // Reset to idle if run ends while armed
  useEffect(() => {
    if (!hasActiveRun && phase !== 'aborting') {
      setPhase('idle')
      if (armTimerRef.current) {
        clearTimeout(armTimerRef.current)
        armTimerRef.current = null
      }
    }
  }, [hasActiveRun, phase])

  // -----------------------------------------------------------------------
  //  Abort logic
  // -----------------------------------------------------------------------

  const doAbort = useCallback(async () => {
    if (!client) {
      toast({ title: 'Not connected to Gateway', variant: 'error' })
      return
    }

    setPhase('aborting')

    try {
      await client.abortRun(sessionKey)
      setPhase('done')
      toast({ title: 'Run aborted', description: `Session ${sessionKey}`, variant: 'success' })
      onAborted?.()
      // Return to idle after a brief flash
      setTimeout(() => setPhase('idle'), 1500)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Abort failed'
      setPhase('idle')
      toast({ title: 'Abort failed', description: message, variant: 'error' })
    }
  }, [client, sessionKey, toast, onAborted])

  const handleClick = useCallback(() => {
    if (!hasActiveRun) return

    if (phase === 'idle') {
      // Arm
      setPhase('armed')
      armTimerRef.current = setTimeout(() => {
        setPhase('idle')
        armTimerRef.current = null
      }, ARM_TIMEOUT_MS)
    } else if (phase === 'armed') {
      // Confirm — abort
      if (armTimerRef.current) {
        clearTimeout(armTimerRef.current)
        armTimerRef.current = null
      }
      void doAbort()
    }
    // Ignore clicks while aborting or done
  }, [phase, hasActiveRun, doAbort])

  // -----------------------------------------------------------------------
  //  Keyboard shortcut: Ctrl+Shift+X
  // -----------------------------------------------------------------------

  useKeyboardShortcuts([
    {
      key: 'x',
      ctrlKey: true,
      shiftKey: true,
      description: 'Abort agent run',
      action: () => {
        if (!hasActiveRun) return
        handleClick()
      },
    },
  ])

  // -----------------------------------------------------------------------
  //  Render
  // -----------------------------------------------------------------------

  const isDisabled = !hasActiveRun || phase === 'aborting' || phase === 'done'

  return (
    <Button
      variant="destructive"
      size="sm"
      disabled={isDisabled}
      onClick={handleClick}
      className={cn(
        'relative select-none transition-all duration-200',
        // Phase-specific overrides
        phase === 'idle' && hasActiveRun && [
          'bg-red-900/60 border border-red-700/40 text-red-300',
          'hover:bg-red-800/80 hover:text-red-100',
        ],
        phase === 'armed' && [
          'bg-red-600 text-white border border-red-400',
          'shadow-[0_0_12px_rgba(239,68,68,0.4)]',
          'animate-pulse',
        ],
        phase === 'aborting' && [
          'bg-red-700/80 text-red-200 cursor-wait',
        ],
        phase === 'done' && [
          'bg-emerald-800/60 text-emerald-300 border border-emerald-600/40',
        ],
        !hasActiveRun && 'opacity-40 cursor-not-allowed',
        className,
      )}
      title={
        !hasActiveRun
          ? 'No active run'
          : phase === 'idle'
            ? 'Click to arm abort (Ctrl+Shift+X)'
            : phase === 'armed'
              ? 'Click again to confirm abort'
              : phase === 'aborting'
                ? 'Aborting...'
                : 'Aborted'
      }
    >
      {/* Icon */}
      <span className="inline-flex items-center gap-1.5">
        {phase === 'aborting' ? (
          <AbortSpinner />
        ) : phase === 'done' ? (
          <CheckIcon />
        ) : (
          <StopIcon />
        )}

        {/* Label */}
        <span className="text-xs font-medium">
          {phase === 'idle' && 'Abort'}
          {phase === 'armed' && 'Confirm Abort'}
          {phase === 'aborting' && 'Aborting…'}
          {phase === 'done' && 'Aborted'}
        </span>
      </span>

      {/* Armed countdown indicator */}
      {phase === 'armed' && <ArmedCountdown durationMs={ARM_TIMEOUT_MS} />}
    </Button>
  )
}

// ---------------------------------------------------------------------------
//  Sub-components
// ---------------------------------------------------------------------------

function StopIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="currentColor"
      className="shrink-0"
    >
      <rect x="2" y="2" width="10" height="10" rx="1.5" />
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

function AbortSpinner() {
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

/** Visual countdown bar for the armed state */
function ArmedCountdown({ durationMs }: { durationMs: number }) {
  return (
    <span
      className="absolute bottom-0 left-0 h-0.5 bg-white/60 rounded-b-md"
      style={{
        animation: `abort-countdown ${durationMs}ms linear forwards`,
      }}
    />
  )
}

// Inject the keyframe for the countdown bar via a <style> tag
// (Tailwind v4 doesn't support arbitrary keyframes easily)
if (typeof document !== 'undefined') {
  const styleId = 'abort-countdown-keyframes'
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = `
      @keyframes abort-countdown {
        from { width: 100%; }
        to { width: 0%; }
      }
    `
    document.head.appendChild(style)
  }
}

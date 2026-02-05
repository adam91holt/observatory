/**
 * ShortcutsHelp — Keyboard shortcuts help modal
 *
 * Triggered by pressing ? key. Displays all available keyboard shortcuts
 * in a categorised grid. Closes on Escape or clicking backdrop.
 *
 * Issue: #29 Keyboard Shortcuts
 */

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
//  Shortcut definitions
// ---------------------------------------------------------------------------

interface ShortcutDef {
  keys: string[]
  description: string
}

interface ShortcutGroup {
  title: string
  shortcuts: ShortcutDef[]
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['G', 'then', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'then', 'S'], description: 'Go to Sessions' },
      { keys: ['G', 'then', 'A'], description: 'Go to Analytics' },
      { keys: ['G', 'then', 'L'], description: 'Go to Live Feed' },
      { keys: ['⌘', '['], description: 'Previous page' },
      { keys: ['⌘', ']'], description: 'Next page' },
    ],
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Command palette' },
      { keys: ['Ctrl', 'Shift', 'X'], description: 'Abort run' },
      { keys: ['/'], description: 'Focus search' },
      { keys: ['Esc'], description: 'Close modals' },
    ],
  },
  {
    title: 'Help',
    shortcuts: [
      { keys: ['?'], description: 'Show this help' },
    ],
  },
]

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function ShortcutsHelp() {
  const [open, setOpen] = useState(false)

  const handleOpen = useCallback(() => setOpen(true), [])
  const handleClose = useCallback(() => setOpen(false), [])

  // Listen for ? key to open
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return
      }

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setOpen((prev) => !prev)
      }

      if (e.key === 'Escape' && open) {
        e.preventDefault()
        handleClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  if (!open) return null

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={handleClose}
      role="presentation"
    >
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={cn(
          'relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border',
          'bg-card shadow-2xl shadow-black/20',
          'animate-in fade-in zoom-in-95 duration-150',
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Keyboard shortcuts"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <KeyboardIcon />
            <h2 className="text-sm font-semibold text-foreground">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Shortcut groups */}
        <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2.5">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.description}
                    className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-secondary/50 transition-colors"
                  >
                    <span className="text-sm text-foreground/80">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1 shrink-0 ml-4">
                      {shortcut.keys.map((key, i) =>
                        key === 'then' ? (
                          <span
                            key={`then-${i}`}
                            className="text-[10px] text-muted-foreground mx-0.5"
                          >
                            then
                          </span>
                        ) : (
                          <kbd
                            key={`key-${i}`}
                            className={cn(
                              'inline-flex items-center justify-center rounded-md',
                              'border border-border bg-secondary/80',
                              'px-1.5 py-0.5 font-mono text-xs text-muted-foreground',
                              'min-w-[24px] text-center',
                            )}
                          >
                            {key}
                          </kbd>
                        ),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Press <kbd className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">?</kbd> to toggle
          </span>
          <span className="text-xs text-muted-foreground">
            <kbd className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
//  Icons
// ---------------------------------------------------------------------------

function KeyboardIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground"
    >
      <rect x="1" y="3" width="14" height="10" rx="2" />
      <path d="M4 7h1" />
      <path d="M7.5 7h1" />
      <path d="M11 7h1" />
      <path d="M4 10h8" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3.5 3.5l7 7" />
      <path d="M10.5 3.5l-7 7" />
    </svg>
  )
}

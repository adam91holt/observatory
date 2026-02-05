import { useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"

export interface KeyboardShortcut {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  shiftKey?: boolean
  description: string
  action: () => void
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const metaMatch = shortcut.metaKey === undefined || shortcut.metaKey === event.metaKey
        const ctrlMatch = shortcut.ctrlKey === undefined || shortcut.ctrlKey === event.ctrlKey
        const shiftMatch = shortcut.shiftKey === undefined || shortcut.shiftKey === event.shiftKey
        const keyMatch = shortcut.key.toLowerCase() === event.key.toLowerCase()

        if (metaMatch && ctrlMatch && shiftMatch && keyMatch) {
          event.preventDefault()
          shortcut.action()
          break
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [shortcuts])
}

// ---------------------------------------------------------------------------
//  "G then X" sequence tracking for navigation shortcuts
// ---------------------------------------------------------------------------

const GO_TIMEOUT_MS = 1500

/**
 * Hook that tracks a two-key "G then X" sequence for Vim-style
 * go-to navigation. The first "G" press starts a timeout window;
 * if the second key arrives within GO_TIMEOUT_MS, the matching
 * navigation fires.
 */
function useGoSequence(routes: Record<string, string>) {
  const navigate = useNavigate()
  const pendingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const reset = useCallback(() => {
    pendingRef.current = false
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Don't intercept when user is typing in an input
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return
      }

      // Ignore when modifier keys are held
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const key = e.key.toLowerCase()

      if (!pendingRef.current) {
        // First key — start sequence if "g"
        if (key === "g") {
          pendingRef.current = true
          timerRef.current = setTimeout(reset, GO_TIMEOUT_MS)
        }
        return
      }

      // Second key — check for route match
      const route = routes[key]
      if (route) {
        e.preventDefault()
        navigate(route)
      }
      // Always reset after second key, matched or not
      reset()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      reset()
    }
  }, [routes, navigate, reset])
}

// ---------------------------------------------------------------------------
//  Go-to route map
// ---------------------------------------------------------------------------

const GO_ROUTES: Record<string, string> = {
  d: "/",          // Dashboard
  s: "/sessions",  // Sessions
  a: "/analytics", // Analytics
  l: "/live",      // Live Feed
}

// Global shortcuts hook for common navigation
export function useGlobalKeyboardShortcuts() {
  const navigate = useNavigate()

  // Vim-style "G then X" navigation
  useGoSequence(GO_ROUTES)

  useKeyboardShortcuts([
    {
      key: "e",
      metaKey: true,
      description: "Jump to errors",
      action: () => {
        navigate("/sessions")
        // TODO: Filter to errors only
      },
    },
    {
      key: "[",
      metaKey: true,
      description: "Previous page",
      action: () => {
        navigate(-1)
      },
    },
    {
      key: "]",
      metaKey: true,
      description: "Next page",
      action: () => {
        navigate(1)
      },
    },
    {
      key: "/",
      description: "Focus search",
      action: () => {
        const searchInput = document.querySelector('input[type="search"], input[type="text"]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      },
    },
    {
      key: "Escape",
      description: "Close modals",
      action: () => {
        // Close any open modals/dialogs
        const closeButtons = document.querySelectorAll('[aria-label="Close"]')
        if (closeButtons.length > 0) {
          (closeButtons[0] as HTMLElement).click()
        }
      },
    },
  ])
}

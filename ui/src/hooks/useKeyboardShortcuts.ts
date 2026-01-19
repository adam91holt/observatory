import { useEffect } from "react"
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

// Global shortcuts hook for common navigation
export function useGlobalKeyboardShortcuts() {
  const navigate = useNavigate()

  useKeyboardShortcuts([
    {
      key: "k",
      metaKey: true,
      description: "Quick search (coming soon)",
      action: () => {
        // TODO: Open command palette / search modal
        console.log("Quick search - TODO")
      },
    },
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

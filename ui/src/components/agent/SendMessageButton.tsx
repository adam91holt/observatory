/**
 * Send Message Button — Stateful send button with loading/error states
 *
 * Shows different visual states:
 * - Default: send icon
 * - Sending: spinner
 * - Error: retry icon with error styling
 * - Disabled: muted when no active session or empty message
 *
 * Issue: #23 Send Message (Basic Agent Control)
 */

import { Send, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type SendButtonState = "idle" | "sending" | "error"

interface SendMessageButtonProps {
  state: SendButtonState
  disabled?: boolean
  onClick: () => void
  className?: string
}

export function SendMessageButton({
  state,
  disabled = false,
  onClick,
  className,
}: SendMessageButtonProps) {
  const isDisabled = disabled || state === "sending"

  return (
    <Button
      type="button"
      size="icon"
      disabled={isDisabled}
      onClick={onClick}
      className={cn(
        "h-9 w-9 shrink-0 transition-all",
        state === "error" &&
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        state === "sending" && "opacity-70",
        className,
      )}
      title={
        state === "error"
          ? "Retry sending message"
          : state === "sending"
            ? "Sending…"
            : "Send message"
      }
    >
      {state === "sending" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "error" ? (
        <RotateCcw className="h-4 w-4" />
      ) : (
        <Send className="h-4 w-4" />
      )}
    </Button>
  )
}

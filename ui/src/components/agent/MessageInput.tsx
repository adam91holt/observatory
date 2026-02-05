/**
 * Message Input — Composable chat input for sending messages to agents
 *
 * Features:
 * - Textarea with auto-resize
 * - Enter to send, Shift+Enter for newline
 * - Character count indicator
 * - Optimistic UI: shows message immediately as "sending"
 * - Error handling with retry
 * - Disabled state when agent has no active session
 *
 * Issue: #23 Send Message (Basic Agent Control)
 */

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react"
import { AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { useGatewayRequest } from "@/hooks/useWebSocket"
import { useSessionsStore } from "@/store/sessions"
import { SendMessageButton, type SendButtonState } from "./SendMessageButton"

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGE_LENGTH = 8000
const CHAR_COUNT_THRESHOLD = 6000 // Show char count when approaching limit

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface OptimisticMessage {
  id: string
  content: string
  timestamp: number
  status: "sending" | "sent" | "error"
  error?: string
}

interface MessageInputProps {
  /** Session key to send messages to */
  sessionKey: string
  /** Agent ID for display/context */
  agentId: string
  /** Called when a message is optimistically added (for parent to show in conversation) */
  onOptimisticMessage?: (message: OptimisticMessage) => void
  /** Called when message send status changes */
  onMessageStatusChange?: (messageId: string, status: OptimisticMessage["status"], error?: string) => void
  /** Additional class names */
  className?: string
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function MessageInput({
  sessionKey,
  agentId,
  onOptimisticMessage,
  onMessageStatusChange,
  className,
}: MessageInputProps) {
  const [message, setMessage] = useState("")
  const [sendState, setSendState] = useState<SendButtonState>("idle")
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { request } = useGatewayRequest()
  const session = useSessionsStore((s) => s.sessions.get(sessionKey))
  const optimisticStartRun = useSessionsStore((s) => s.optimisticStartRun)

  // Determine if input should be disabled
  const hasActiveSession = !!session
  const isDisabled = !hasActiveSession || sendState === "sending"
  const trimmedMessage = message.trim()
  const canSend = trimmedMessage.length > 0 && trimmedMessage.length <= MAX_MESSAGE_LENGTH && !isDisabled

  // -----------------------------------------------------------------------
  //  Auto-resize textarea
  // -----------------------------------------------------------------------

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    // Clamp between 1 line (~38px) and ~6 lines (~168px)
    const maxHeight = 168
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`
  }, [])

  useEffect(() => {
    adjustTextareaHeight()
  }, [message, adjustTextareaHeight])

  // -----------------------------------------------------------------------
  //  Send message
  // -----------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || sendState === "sending") return

      const optimisticId = `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const trimmed = text.trim()

      // Optimistic UI — show message immediately
      setSendState("sending")
      setLastError(null)
      setLastFailedMessage(null)
      setMessage("")

      onOptimisticMessage?.({
        id: optimisticId,
        content: trimmed,
        timestamp: Date.now(),
        status: "sending",
      })

      try {
        const result = await request<{ runId: string }>("chat.send", {
          sessionKey,
          message: trimmed,
          idempotencyKey: `reef-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        })

        if (result?.runId) {
          // Mark session as running optimistically
          optimisticStartRun(sessionKey, result.runId)
        }

        setSendState("idle")
        onMessageStatusChange?.(optimisticId, "sent")
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to send message"
        setSendState("error")
        setLastError(errorMsg)
        setLastFailedMessage(trimmed)
        onMessageStatusChange?.(optimisticId, "error", errorMsg)
      }
    },
    [sendState, sessionKey, request, optimisticStartRun, onOptimisticMessage, onMessageStatusChange],
  )

  // -----------------------------------------------------------------------
  //  Retry failed message
  // -----------------------------------------------------------------------

  const retryLastMessage = useCallback(() => {
    if (lastFailedMessage) {
      void sendMessage(lastFailedMessage)
    }
  }, [lastFailedMessage, sendMessage])

  // -----------------------------------------------------------------------
  //  Keyboard handling
  // -----------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter to send (without Shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (canSend) {
          void sendMessage(message)
        }
      }
    },
    [canSend, message, sendMessage],
  )

  // -----------------------------------------------------------------------
  //  Click handler for button
  // -----------------------------------------------------------------------

  const handleSendClick = useCallback(() => {
    if (sendState === "error" && lastFailedMessage) {
      retryLastMessage()
    } else if (canSend) {
      void sendMessage(message)
    }
  }, [sendState, lastFailedMessage, retryLastMessage, canSend, message, sendMessage])

  // -----------------------------------------------------------------------
  //  Character count display
  // -----------------------------------------------------------------------

  const showCharCount = trimmedMessage.length >= CHAR_COUNT_THRESHOLD
  const isOverLimit = trimmedMessage.length > MAX_MESSAGE_LENGTH
  const charCountText = `${trimmedMessage.length.toLocaleString()}/${MAX_MESSAGE_LENGTH.toLocaleString()}`

  // -----------------------------------------------------------------------
  //  Render
  // -----------------------------------------------------------------------

  // Suppress unused variable warning — agentId is available for future use
  void agentId

  return (
    <div className={cn("border-t bg-background", className)}>
      {/* Error banner */}
      {lastError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">{lastError}</span>
          <button
            className="text-xs font-medium underline underline-offset-2 hover:no-underline shrink-0"
            onClick={retryLastMessage}
          >
            Retry
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 p-3">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              !hasActiveSession
                ? "No active session"
                : "Send a message… (Enter to send, Shift+Enter for newline)"
            }
            disabled={isDisabled}
            rows={1}
            className={cn(
              "w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "scrollbar-thin scrollbar-thumb-muted-foreground/20",
              isOverLimit && "border-destructive focus-visible:ring-destructive",
            )}
          />

          {/* Character count */}
          {showCharCount && (
            <div
              className={cn(
                "absolute right-2 bottom-1.5 text-[10px] font-mono tabular-nums",
                isOverLimit ? "text-destructive font-medium" : "text-muted-foreground",
              )}
            >
              {charCountText}
            </div>
          )}
        </div>

        <SendMessageButton
          state={sendState}
          disabled={sendState === "error" ? !lastFailedMessage : !canSend}
          onClick={handleSendClick}
        />
      </div>

      {/* No session hint */}
      {!hasActiveSession && (
        <div className="px-4 pb-2 text-xs text-muted-foreground">
          This session is not active. Messages cannot be sent.
        </div>
      )}
    </div>
  )
}

export type { OptimisticMessage, MessageInputProps }

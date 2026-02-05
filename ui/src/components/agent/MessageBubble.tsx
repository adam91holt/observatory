/**
 * MessageBubble — Chat-style message component for the Agent Detail view
 *
 * Renders messages in a chat bubble format with:
 * - Role-based styling (user = right-aligned blue, assistant = left-aligned)
 * - Markdown rendering for assistant messages
 * - Collapsible tool calls inline
 * - Timestamp, token usage, cost metadata
 * - Copy-to-clipboard button
 *
 * Issue: #19 Conversation History
 */

import { useState } from "react"
import { format } from "date-fns"
import {
  User,
  Bot,
  Settings,
  Terminal,
  Copy,
  Check,
  Coins,
  Clock,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
} from "lucide-react"
import { cn, formatCost, formatTokens, formatDuration } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { MarkdownContent } from "@/components/features/MarkdownContent"
import { ToolCallBlock } from "./ToolCallBlock"
import type { Message, MessageContent } from "@/types"

// ---------------------------------------------------------------------------
//  Props
// ---------------------------------------------------------------------------

interface AgentMessageBubbleProps {
  message: Message
  /** If provided, tool results are matched to their tool_use blocks */
  toolResults?: Map<
    string,
    { content: string; isError?: boolean; durationMs?: number }
  >
  className?: string
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function extractTextContent(message: Message): string {
  if (typeof message.content === "string") return message.content
  if (Array.isArray(message.content)) {
    return message.content
      .filter(
        (c): c is MessageContent & { type: "text" } => c.type === "text",
      )
      .map((c) => c.text ?? "")
      .join("\n")
  }
  return ""
}

function extractToolUseBlocks(
  message: Message,
): (MessageContent & { type: "tool_use" })[] {
  if (typeof message.content === "string") return []
  if (!Array.isArray(message.content)) return []
  return message.content.filter(
    (c): c is MessageContent & { type: "tool_use" } => c.type === "tool_use",
  )
}

function truncate(text: string, max = 200): string {
  return text.length <= max ? text : text.slice(0, max) + "…"
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function AgentMessageBubble({
  message,
  toolResults,
  className,
}: AgentMessageBubbleProps) {
  const [copied, setCopied] = useState(false)
  const [resultExpanded, setResultExpanded] = useState(false)

  const isUser = message.role === "user"
  const isAssistant = message.role === "assistant"
  const isTool = message.role === "tool"
  const isSystem = message.role === "system"

  const text = extractTextContent(message)
  const toolUseBlocks = extractToolUseBlocks(message)

  const totalTokens =
    (message.usage?.input_tokens ?? 0) + (message.usage?.output_tokens ?? 0)
  const messageCost = message.cost ?? 0

  const copyMessage = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ---- Tool result messages (role=tool) get compact rendering ---- //
  if (isTool) {
    const resultContent =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content)
    const isError = (message as any).isError
    const details = (message as any).details

    return (
      <div
        className={cn(
          "max-w-[90%] rounded-lg border overflow-hidden",
          isError
            ? "bg-red-500/5 border-red-500/20"
            : "bg-green-500/5 border-green-500/20",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => setResultExpanded((v) => !v)}
          className="w-full px-3 py-2 flex items-center justify-between text-xs hover:bg-muted/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isError ? (
              <XCircle className="h-3.5 w-3.5 text-red-500" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5 text-green-500" />
            )}
            <span className="font-mono font-semibold">{message.name}</span>
            <Badge
              className={cn(
                "text-[9px] h-4 px-1",
                isError
                  ? "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30"
                  : "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30",
              )}
            >
              {isError ? "ERROR" : "RESULT"}
            </Badge>
            {details?.durationMs !== undefined && (
              <span className="font-mono text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {details.durationMs}ms
              </span>
            )}
          </div>
          {resultExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {resultExpanded && (
          <div className="px-3 pb-2 border-t border-border/50">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80 max-h-[400px] overflow-auto mt-2">
              {resultContent}
            </pre>
          </div>
        )}
        {!resultExpanded && (
          <div className="px-3 pb-2">
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
              {truncate(resultContent, 120)}
            </pre>
          </div>
        )}
      </div>
    )
  }

  // ---- System messages ---- //
  if (isSystem) {
    return (
      <div
        className={cn(
          "mx-auto max-w-[80%] text-center py-2 px-4 rounded-lg",
          "bg-muted/30 border border-border/50",
          className,
        )}
      >
        <div className="flex items-center justify-center gap-2 mb-1">
          <Settings className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            System
          </span>
          {message.timestamp && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {format(new Date(message.timestamp), "HH:mm:ss")}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-3">{truncate(text, 300)}</p>
      </div>
    )
  }

  // ---- User & Assistant messages ---- //
  const Icon = isUser ? User : Bot

  return (
    <div
      className={cn(
        "group flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
        className,
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm",
          isUser
            ? "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
            : "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Bubble */}
      <div
        className={cn(
          "max-w-[80%] min-w-0 space-y-2",
          isUser ? "items-end" : "items-start",
        )}
      >
        {/* Header row */}
        <div
          className={cn(
            "flex items-center gap-2 text-xs",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <span className="font-semibold capitalize">{message.role}</span>
          {message.timestamp && (
            <span className="text-muted-foreground font-mono">
              {format(new Date(message.timestamp), "HH:mm:ss")}
            </span>
          )}
        </div>

        {/* Message content */}
        {text && (
          <div
            className={cn(
              "relative rounded-2xl px-4 py-3 shadow-sm",
              isUser
                ? "bg-blue-500 text-white rounded-tr-sm"
                : "bg-muted/60 border border-border/50 rounded-tl-sm",
            )}
          >
            {/* Copy button */}
            <button
              type="button"
              onClick={copyMessage}
              className={cn(
                "absolute top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded",
                isUser
                  ? "right-2 hover:bg-blue-600"
                  : "right-2 hover:bg-muted",
              )}
              title="Copy message"
            >
              {copied ? (
                <Check className="h-3 w-3 text-green-400" />
              ) : (
                <Copy
                  className={cn(
                    "h-3 w-3",
                    isUser ? "text-blue-200" : "text-muted-foreground",
                  )}
                />
              )}
            </button>

            {isAssistant ? (
              <div className="prose-sm max-w-none">
                <MarkdownContent content={text} />
              </div>
            ) : (
              <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
            )}
          </div>
        )}

        {/* Tool calls (assistant messages) */}
        {toolUseBlocks.length > 0 && (
          <div className="space-y-2 mt-1">
            {toolUseBlocks.map((tool) => (
              <ToolCallBlock
                key={tool.id}
                tool={tool}
                result={
                  tool.id ? toolResults?.get(tool.id) : undefined
                }
              />
            ))}
          </div>
        )}

        {/* Metadata footer */}
        {(totalTokens > 0 ||
          messageCost > 0 ||
          message.duration !== undefined) && (
          <div
            className={cn(
              "flex items-center gap-2 flex-wrap text-[10px]",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            {totalTokens > 0 && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 font-mono">
                <Coins className="h-3 w-3" />
                {formatTokens(totalTokens)}
                {message.usage?.input_tokens != null &&
                  message.usage?.output_tokens != null && (
                    <span className="opacity-60 ml-0.5">
                      {formatTokens(message.usage.input_tokens)}↓{" "}
                      {formatTokens(message.usage.output_tokens)}↑
                    </span>
                  )}
              </span>
            )}
            {message.usage?.cache_read_input_tokens != null &&
              message.usage.cache_read_input_tokens > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-700 dark:text-purple-400 font-mono">
                  ⚡ {formatTokens(message.usage.cache_read_input_tokens)}{" "}
                  cached
                </span>
              )}
            {messageCost > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-400 font-mono font-semibold">
                💰 {formatCost(messageCost)}
              </span>
            )}
            {message.duration !== undefined && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-700 dark:text-orange-400 font-mono">
                <Clock className="h-3 w-3" />
                {formatDuration(message.duration)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

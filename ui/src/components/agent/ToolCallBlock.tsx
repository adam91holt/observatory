/**
 * ToolCallBlock — Collapsible tool call display
 *
 * Shows tool invocations inline within conversation messages.
 * Collapsed by default, expandable to show full input/output.
 *
 * Issue: #19 Conversation History
 */

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  Copy,
  Check,
  Clock,
  CheckCircle,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { JsonViewer } from "@/components/features/JsonViewer"
import type { MessageContent } from "@/types"

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

interface ToolCallBlockProps {
  /** The tool_use content block */
  tool: MessageContent & { type: "tool_use" }
  /** Optional matching tool_result for this call */
  result?: {
    content: string
    isError?: boolean
    durationMs?: number
  }
  className?: string
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function formatToolParams(
  input: unknown,
): { key: string; value: string; full: string }[] {
  if (!input || typeof input !== "object") return []
  return Object.entries(input as Record<string, unknown>).map(
    ([key, value]) => {
      const strValue =
        typeof value === "string" ? value : JSON.stringify(value)
      const truncated =
        strValue.length > 100 ? strValue.slice(0, 100) + "…" : strValue
      return { key, value: truncated, full: strValue }
    },
  )
}

function truncate(text: string, max = 200): string {
  return text.length <= max ? text : text.slice(0, max) + "…"
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function ToolCallBlock({ tool, result, className }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const params = formatToolParams(tool.input)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(id)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  return (
    <div
      className={cn(
        "rounded-lg border-2 overflow-hidden shadow-sm",
        "bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/30",
        className,
      )}
    >
      {/* ---- Header ---- */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-orange-500/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-orange-500/20">
            <Wrench className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm">{tool.name}</span>
              <Badge className="text-[10px] h-5 bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30">
                TOOL
              </Badge>
            </div>
            {tool.id && (
              <span className="text-[10px] font-mono text-muted-foreground">
                {tool.id.slice(0, 20)}…
              </span>
            )}
          </div>
        </div>

        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* ---- Params preview (always visible when present) ---- */}
      {params.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {params
            .slice(0, expanded ? params.length : 3)
            .map(({ key, value, full }) => (
              <div key={key} className="flex items-start gap-2 text-sm">
                <span className="font-mono font-medium text-orange-600 dark:text-orange-400 shrink-0">
                  {key}:
                </span>
                <span className="font-mono text-muted-foreground break-all">
                  {expanded ? full : value}
                </span>
                {expanded && full.length > 50 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyToClipboard(full, `${tool.id}-${key}`)
                    }}
                    className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                    title="Copy value"
                  >
                    {copiedKey === `${tool.id}-${key}` ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <Copy className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>
                )}
              </div>
            ))}
          {!expanded && params.length > 3 && (
            <span className="text-xs text-muted-foreground">
              +{params.length - 3} more params
            </span>
          )}
        </div>
      )}

      {/* ---- Expanded: full JSON input ---- */}
      {expanded && (
        <div className="px-4 py-3 border-t border-orange-500/20 bg-orange-500/5">
          <div className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-2">
            Full Input:
          </div>
          <JsonViewer data={tool.input} />
        </div>
      )}

      {/* ---- Result (inline) ---- */}
      {result && (
        <div
          className={cn(
            "px-4 py-3 border-t",
            result.isError
              ? "border-red-500/20 bg-red-500/5"
              : "border-green-500/20 bg-green-500/5",
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {result.isError ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              <span
                className={cn(
                  "text-xs font-semibold",
                  result.isError
                    ? "text-red-600 dark:text-red-400"
                    : "text-green-600 dark:text-green-400",
                )}
              >
                {result.isError ? "Error" : "Result"}
              </span>
              {result.durationMs !== undefined && (
                <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {result.durationMs}ms
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                copyToClipboard(result.content, `result-${tool.id}`)
              }}
              className="p-1 rounded hover:bg-muted transition-colors"
              title="Copy result"
            >
              {copiedKey === `result-${tool.id}` ? (
                <Check className="h-3 w-3 text-green-500" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/80 max-h-[300px] overflow-auto">
            {expanded ? result.content : truncate(result.content, 200)}
          </pre>
          {!expanded && result.content.length > 200 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-xs text-muted-foreground hover:text-foreground mt-1"
            >
              Show full result ({result.content.length} chars)
            </button>
          )}
        </div>
      )}
    </div>
  )
}

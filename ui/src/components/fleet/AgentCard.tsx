/**
 * AgentCard — Individual agent card for the Fleet Overview
 *
 * Shows agent name, emoji, model, live status, session count,
 * token usage (24h), and last activity. Clicking navigates to
 * filtered session list for that agent.
 *
 * Issue: #15 Agent Cards (Fleet Overview Dashboard)
 */

import { formatDistanceToNow } from "date-fns"
import { useNavigate } from "react-router-dom"
import { Cpu, MessageSquare, Zap, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { getAgentEmoji, formatTokens } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import type { Agent, AgentStats } from "@/types"

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

export type AgentStatus = "online" | "busy" | "idle" | "offline"

export interface AgentCardProps {
  agent: Agent
  status: AgentStatus
  sessionCount: number
  tokens24h: number
  lastActivity: number | null // epoch ms, null = never
  currentActivity?: string // e.g. "Processing WhatsApp message"
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  online: {
    label: "Online",
    dotClass: "bg-green-500",
    badgeClass:
      "border-green-500/30 bg-green-500/10 text-green-400",
  },
  busy: {
    label: "Busy",
    dotClass: "bg-amber-400 animate-pulse",
    badgeClass:
      "border-amber-400/30 bg-amber-400/10 text-amber-400",
  },
  idle: {
    label: "Idle",
    dotClass: "bg-blue-400",
    badgeClass:
      "border-blue-400/30 bg-blue-400/10 text-blue-400",
  },
  offline: {
    label: "Offline",
    dotClass: "bg-zinc-500",
    badgeClass:
      "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
  },
}

function truncateModel(model: string): string {
  // e.g. "anthropic/claude-opus-4-6" → "claude-opus-4"
  const parts = model.split("/")
  const name = parts[parts.length - 1]
  // Trim trailing hash or long suffixes
  if (name.length > 24) return name.slice(0, 24) + "…"
  return name
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function AgentCard({
  agent,
  status,
  sessionCount,
  tokens24h,
  lastActivity,
  currentActivity,
}: AgentCardProps) {
  const navigate = useNavigate()
  const cfg = STATUS_CONFIG[status]
  const emoji = getAgentEmoji(agent.id)
  const modelLabel = truncateModel(agent.model.primary)

  const handleClick = () => {
    // Navigate to sessions page filtered by this agent
    navigate(`/sessions?agent=${encodeURIComponent(agent.id)}`)
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        // Base card
        "relative group w-full text-left rounded-xl border bg-card p-5",
        "transition-all duration-200 cursor-pointer",
        "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        // Busy glow
        status === "busy" && "border-amber-400/30 shadow-md shadow-amber-400/10",
      )}
    >
      {/* Busy glow overlay */}
      {status === "busy" && (
        <div
          className="pointer-events-none absolute inset-0 rounded-xl opacity-40 animate-pulse"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(251,191,36,0.12) 0%, transparent 70%)",
          }}
        />
      )}

      {/* Header: emoji + name + status */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl flex-shrink-0 select-none">{emoji}</span>
          <div className="min-w-0">
            <h3 className="text-base font-semibold truncate text-foreground">
              {agent.name || agent.id}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Cpu className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground font-mono truncate">
                {modelLabel}
              </span>
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn("flex-shrink-0 text-[11px] gap-1.5 px-2 py-0.5", cfg.badgeClass)}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
          {cfg.label}
        </Badge>
      </div>

      {/* Current activity (if busy) */}
      {currentActivity && status === "busy" && (
        <div className="mb-3 text-xs text-amber-300/80 bg-amber-400/5 rounded-md px-2.5 py-1.5 border border-amber-400/10 truncate">
          ⚡ {currentActivity}
        </div>
      )}

      {/* Metrics row */}
      <div className="grid grid-cols-3 gap-3">
        {/* Sessions */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            <MessageSquare className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wider font-medium">
              Sessions
            </span>
          </div>
          <div className="text-lg font-bold tabular-nums text-foreground">
            {sessionCount}
          </div>
        </div>

        {/* Tokens (24h) */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Zap className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wider font-medium">
              24h Tok
            </span>
          </div>
          <div className="text-lg font-bold tabular-nums font-mono text-foreground">
            {formatTokens(tokens24h)}
          </div>
        </div>

        {/* Last activity */}
        <div className="space-y-0.5">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span className="text-[10px] uppercase tracking-wider font-medium">
              Last
            </span>
          </div>
          <div className="text-sm font-medium text-foreground truncate">
            {lastActivity
              ? formatDistanceToNow(new Date(lastActivity), { addSuffix: false })
              : "—"}
          </div>
        </div>
      </div>

      {/* Bottom accent line on hover */}
      <div
        className={cn(
          "absolute bottom-0 left-4 right-4 h-0.5 rounded-full transition-opacity duration-200",
          "bg-primary opacity-0 group-hover:opacity-100",
        )}
      />
    </button>
  )
}

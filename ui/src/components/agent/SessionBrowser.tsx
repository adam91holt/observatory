/**
 * SessionBrowser — Browsable session list for an agent
 *
 * Table/list view with:
 * - Columns: session key, status, created, last activity, messages, tokens
 * - Sort by any column
 * - Filter by status (active/idle/archived)
 * - Search by session key or display name
 * - Click row to navigate to session detail
 * - Pagination for large lists
 * - Compact, info-dense rows
 *
 * Issue: #21 Session Browser
 */

import { useState, useMemo, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { formatDistanceToNow, format } from "date-fns"
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  MessagesSquare,
} from "lucide-react"
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { getSessions, getTranscript } from "@/api/observatory"
import { cn, formatTokens } from "@/lib/utils"
import type { Session as ApiSession } from "@/types"

// ---------------------------------------------------------------------------
//  Types
// ---------------------------------------------------------------------------

type SessionStatus = "active" | "idle" | "archived"
type SortField =
  | "sessionKey"
  | "status"
  | "createdAt"
  | "lastActivity"
  | "messages"
  | "tokens"
type SortDirection = "asc" | "desc"

interface EnrichedSession extends ApiSession {
  status: SessionStatus
  messageCount?: number
  tokenUsage?: number
  channel?: string
  isSubagent: boolean
}

interface SessionBrowserProps {
  agentId: string
  onSelectSession?: (session: EnrichedSession) => void
  className?: string
}

// ---------------------------------------------------------------------------
//  Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25

const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; variant: "default" | "secondary" | "outline"; dotClass: string }
> = {
  active: {
    label: "Active",
    variant: "default",
    dotClass: "bg-green-500 animate-pulse",
  },
  idle: {
    label: "Idle",
    variant: "secondary",
    dotClass: "bg-yellow-500",
  },
  archived: {
    label: "Archived",
    variant: "outline",
    dotClass: "bg-gray-400",
  },
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

function deriveStatus(session: ApiSession): SessionStatus {
  if (session.archived) return "archived"
  const fiveMinAgo = Date.now() - 5 * 60 * 1000
  return session.updatedAt > fiveMinAgo ? "active" : "idle"
}

function parseSessionKey(key: string) {
  const parts = key.split(":")
  if (parts[0] === "agent" && parts.length >= 3) {
    return {
      isSubagent: parts[2] === "subagent",
      channel: parts[2] !== "subagent" ? parts[2] : undefined,
    }
  }
  return { isSubagent: false, channel: undefined }
}

function truncateKey(key: string, maxLen = 60): string {
  if (key.length <= maxLen) return key
  return key.slice(0, maxLen - 3) + "…"
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export function SessionBrowser({
  agentId,
  onSelectSession,
  className,
}: SessionBrowserProps) {
  const navigate = useNavigate()

  // Local state
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<SessionStatus | "all">("all")
  const [sortField, setSortField] = useState<SortField>("lastActivity")
  const [sortDir, setSortDir] = useState<SortDirection>("desc")
  const [page, setPage] = useState(0)

  // Fetch sessions
  const { data: sessionsData, isLoading } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    refetchInterval: 10000,
  })

  // Enrich sessions for this agent
  const enrichedSessions: EnrichedSession[] = useMemo(() => {
    if (!sessionsData?.sessions) return []
    return sessionsData.sessions
      .filter((s) => s.agentId === agentId)
      .map((s) => {
        const parsed = parseSessionKey(s.sessionKey)
        return {
          ...s,
          status: deriveStatus(s),
          channel: parsed.channel,
          isSubagent: parsed.isSubagent,
        }
      })
  }, [sessionsData, agentId])

  // Filter
  const filtered = useMemo(() => {
    return enrichedSessions.filter((s) => {
      // Status filter
      if (statusFilter !== "all" && s.status !== statusFilter) return false
      // Search
      if (search) {
        const q = search.toLowerCase()
        const matchesKey = s.sessionKey.toLowerCase().includes(q)
        const matchesName = s.displayName?.toLowerCase().includes(q)
        const matchesId = s.sessionId.toLowerCase().includes(q)
        if (!matchesKey && !matchesName && !matchesId) return false
      }
      return true
    })
  }, [enrichedSessions, statusFilter, search])

  // Sort
  const sorted = useMemo(() => {
    const list = [...filtered]
    const dir = sortDir === "asc" ? 1 : -1

    list.sort((a, b) => {
      switch (sortField) {
        case "sessionKey":
          return dir * a.sessionKey.localeCompare(b.sessionKey)
        case "status": {
          const order: Record<SessionStatus, number> = {
            active: 0,
            idle: 1,
            archived: 2,
          }
          return dir * (order[a.status] - order[b.status])
        }
        case "createdAt":
          // Use updatedAt as proxy since createdAt isn't always available
          return dir * (a.updatedAt - b.updatedAt)
        case "lastActivity":
          return dir * (a.updatedAt - b.updatedAt)
        case "messages":
          return dir * ((a.messageCount ?? 0) - (b.messageCount ?? 0))
        case "tokens":
          return dir * ((a.tokenUsage ?? 0) - (b.tokenUsage ?? 0))
        default:
          return 0
      }
    })
    return list
  }, [filtered, sortField, sortDir])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const paginated = sorted.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  )

  // Reset page when filters change
  const handleSearch = useCallback(
    (value: string) => {
      setSearch(value)
      setPage(0)
    },
    []
  )

  const handleStatusFilter = useCallback(
    (status: SessionStatus | "all") => {
      setStatusFilter(status)
      setPage(0)
    },
    []
  )

  // Sort handler
  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"))
      } else {
        setSortField(field)
        setSortDir("desc")
      }
      setPage(0)
    },
    [sortField]
  )

  // Row click
  const handleRowClick = useCallback(
    (session: EnrichedSession) => {
      if (onSelectSession) {
        onSelectSession(session)
      } else {
        navigate(
          `/sessions/${session.agentId}/${encodeURIComponent(session.sessionId)}`
        )
      }
    },
    [navigate, onSelectSession]
  )

  // Sort indicator
  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field)
      return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    )
  }

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = { all: 0, active: 0, idle: 0, archived: 0 }
    for (const s of enrichedSessions) {
      counts[s.status]++
      counts.all++
    }
    return counts
  }, [enrichedSessions])

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        <div className="flex gap-3">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-64" />
        </div>
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Toolbar: Search + Status Filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search sessions…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
          {search && (
            <button
              onClick={() => handleSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex gap-1">
          {(["all", "active", "idle", "archived"] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => handleStatusFilter(status)}
            >
              {status === "all" ? "All" : STATUS_CONFIG[status].label}
              <span className="ml-1 text-[10px] opacity-70">
                {statusCounts[status]}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      {paginated.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <div className="p-3 rounded-full bg-muted mb-3">
              <MessagesSquare className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              {search || statusFilter !== "all"
                ? "No sessions match your filters"
                : "No sessions yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {search || statusFilter !== "all"
                ? "Try adjusting your search or filter"
                : "Sessions will appear here once the agent starts conversations"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="h-9 px-3 cursor-pointer select-none text-xs"
                  onClick={() => handleSort("sessionKey")}
                >
                  <span className="flex items-center">
                    Session
                    <SortIcon field="sessionKey" />
                  </span>
                </TableHead>
                <TableHead
                  className="h-9 px-3 cursor-pointer select-none text-xs w-24"
                  onClick={() => handleSort("status")}
                >
                  <span className="flex items-center">
                    Status
                    <SortIcon field="status" />
                  </span>
                </TableHead>
                <TableHead
                  className="h-9 px-3 cursor-pointer select-none text-xs w-32 hidden lg:table-cell"
                  onClick={() => handleSort("createdAt")}
                >
                  <span className="flex items-center">
                    Created
                    <SortIcon field="createdAt" />
                  </span>
                </TableHead>
                <TableHead
                  className="h-9 px-3 cursor-pointer select-none text-xs w-32"
                  onClick={() => handleSort("lastActivity")}
                >
                  <span className="flex items-center">
                    Last Activity
                    <SortIcon field="lastActivity" />
                  </span>
                </TableHead>
                <TableHead className="h-9 px-3 text-xs w-20 text-right hidden md:table-cell">
                  Type
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.map((session) => {
                const statusCfg = STATUS_CONFIG[session.status]
                return (
                  <TableRow
                    key={session.sessionKey}
                    className="cursor-pointer group"
                    onClick={() => handleRowClick(session)}
                  >
                    {/* Session Key */}
                    <TableCell className="py-2 px-3">
                      <div className="space-y-0.5">
                        {session.displayName && (
                          <div className="text-sm font-medium truncate max-w-[400px] group-hover:text-primary transition-colors">
                            {session.displayName}
                          </div>
                        )}
                        <div
                          className={cn(
                            "font-mono text-muted-foreground truncate max-w-[400px]",
                            session.displayName ? "text-[11px]" : "text-xs group-hover:text-primary transition-colors"
                          )}
                          title={session.sessionKey}
                        >
                          {truncateKey(session.sessionKey)}
                        </div>
                      </div>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="py-2 px-3">
                      <Badge
                        variant={statusCfg.variant}
                        className="text-[10px] px-1.5 py-0 h-5 gap-1"
                      >
                        <span
                          className={cn(
                            "inline-block h-1.5 w-1.5 rounded-full",
                            statusCfg.dotClass
                          )}
                        />
                        {statusCfg.label}
                      </Badge>
                    </TableCell>

                    {/* Created (hidden on small screens) */}
                    <TableCell className="py-2 px-3 text-xs text-muted-foreground hidden lg:table-cell">
                      <span title={format(new Date(session.updatedAt), "PPpp")}>
                        {format(new Date(session.updatedAt), "MMM d, HH:mm")}
                      </span>
                    </TableCell>

                    {/* Last Activity */}
                    <TableCell className="py-2 px-3 text-xs text-muted-foreground">
                      <span title={format(new Date(session.updatedAt), "PPpp")}>
                        {formatDistanceToNow(new Date(session.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </TableCell>

                    {/* Type badges (hidden on small screens) */}
                    <TableCell className="py-2 px-3 text-right hidden md:table-cell">
                      <div className="flex gap-1 justify-end">
                        {session.isSubagent && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5"
                          >
                            sub
                          </Badge>
                        )}
                        {session.channel && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5"
                          >
                            {session.channel}
                          </Badge>
                        )}
                        {session.chatType && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 h-5"
                          >
                            {session.chatType}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span>
            {currentPage * PAGE_SIZE + 1}–
            {Math.min((currentPage + 1) * PAGE_SIZE, sorted.length)} of{" "}
            {sorted.length} sessions
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-2">
              {currentPage + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

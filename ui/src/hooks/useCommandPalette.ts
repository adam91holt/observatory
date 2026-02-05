import { useState, useCallback, useMemo, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import { getAgents, getSessions } from "@/api/observatory"
import { useThemeStore } from "@/store/theme"
import { getAgentEmoji } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandItemKind = "page" | "agent" | "session" | "action"

export interface CommandItem {
  id: string
  kind: CommandItemKind
  label: string
  description?: string
  icon?: string
  /** Shortcut hint shown on the right, e.g. "⌘E" */
  shortcut?: string
  onSelect: () => void
}

interface FuzzyMatch {
  item: CommandItem
  /** Indices into `item.label` that matched */
  matchIndices: number[]
  score: number
}

const RECENT_KEY = "reef-cmd-palette-recent"
const MAX_RECENT = 5

// ---------------------------------------------------------------------------
// Fuzzy matching
// ---------------------------------------------------------------------------

function fuzzyMatch(text: string, query: string): { matched: boolean; indices: number[]; score: number } {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const indices: number[] = []
  let qi = 0
  let score = 0
  let prevIdx = -2

  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      indices.push(i)
      // Consecutive matches score higher
      score += prevIdx === i - 1 ? 10 : 1
      // Matches at word boundaries score higher
      if (i === 0 || text[i - 1] === " " || text[i - 1] === "/") {
        score += 5
      }
      prevIdx = i
      qi++
    }
  }

  const matched = qi === q.length
  // Penalise longer labels so shorter/more exact matches bubble up
  if (matched) {
    score -= text.length * 0.1
  }

  return { matched, indices, score }
}

// ---------------------------------------------------------------------------
// Recent items persistence
// ---------------------------------------------------------------------------

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveRecent(ids: string[]) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)))
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentIds, setRecentIds] = useState<string[]>(loadRecent)
  const navigate = useNavigate()
  const theme = useThemeStore((s) => s.theme)
  const setTheme = useThemeStore((s) => s.setTheme)

  // Track latest navigate/setTheme refs so closures stay fresh
  const navRef = useRef(navigate)
  navRef.current = navigate
  const themeRef = useRef({ theme, setTheme })
  themeRef.current = { theme, setTheme }

  // Fetch agents & sessions for dynamic items
  const { data: agentsData } = useQuery({
    queryKey: ["agents"],
    queryFn: getAgents,
    staleTime: 60_000,
    enabled: open,
  })

  const { data: sessionsData } = useQuery({
    queryKey: ["sessions"],
    queryFn: getSessions,
    staleTime: 60_000,
    enabled: open,
  })

  // ------- Build the full catalogue of commands -------
  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    // Pages
    const pages: { label: string; path: string; icon: string; shortcut?: string }[] = [
      { label: "Dashboard", path: "/", icon: "📊" },
      { label: "Analytics", path: "/analytics", icon: "📈" },
      { label: "Channels", path: "/channels", icon: "💬" },
      { label: "Sessions", path: "/sessions", icon: "👥", shortcut: "⌘E" },
      { label: "Logs", path: "/live", icon: "📡" },
      { label: "Sub-Agent Runs", path: "/runs", icon: "🔀" },
      { label: "Config", path: "/config", icon: "⚙️" },
    ]

    for (const p of pages) {
      items.push({
        id: `page:${p.path}`,
        kind: "page",
        label: p.label,
        description: `Navigate to ${p.label}`,
        icon: p.icon,
        shortcut: p.shortcut,
        onSelect: () => navRef.current(p.path),
      })
    }

    // Agents
    if (agentsData?.agents) {
      for (const a of agentsData.agents) {
        items.push({
          id: `agent:${a.id}`,
          kind: "agent",
          label: a.name || a.id,
          description: `Agent · ${a.model?.primary ?? "unknown model"}`,
          icon: getAgentEmoji(a.id),
          onSelect: () => navRef.current(`/sessions?agent=${a.id}`),
        })
      }
    }

    // Sessions (show most recent 30)
    if (sessionsData?.sessions) {
      const sorted = [...sessionsData.sessions].sort((a, b) => b.updatedAt - a.updatedAt)
      for (const s of sorted.slice(0, 30)) {
        const name = s.displayName || s.sessionId
        items.push({
          id: `session:${s.sessionKey}`,
          kind: "session",
          label: name,
          description: `Session · ${s.agentId}`,
          icon: getAgentEmoji(s.agentId),
          onSelect: () => navRef.current(`/sessions/${s.agentId}/${encodeURIComponent(s.sessionId)}`),
        })
      }
    }

    // Actions
    items.push({
      id: "action:toggle-theme",
      kind: "action",
      label: "Toggle theme",
      description: `Current: ${themeRef.current.theme}`,
      icon: "🎨",
      onSelect: () => {
        const cur = themeRef.current.theme
        themeRef.current.setTheme(cur === "dark" ? "light" : "dark")
      },
    })

    return items
  }, [agentsData, sessionsData])

  // ------- Filtered results (fuzzy) -------
  const results = useMemo<FuzzyMatch[]>(() => {
    if (!query.trim()) return []

    const matches: FuzzyMatch[] = []
    for (const item of allItems) {
      // Match against label + description
      const labelResult = fuzzyMatch(item.label, query)
      const descResult = item.description ? fuzzyMatch(item.description, query) : null

      if (labelResult.matched) {
        matches.push({ item, matchIndices: labelResult.indices, score: labelResult.score })
      } else if (descResult?.matched) {
        matches.push({ item, matchIndices: [], score: descResult.score - 5 })
      }
    }

    matches.sort((a, b) => b.score - a.score)
    return matches.slice(0, 20)
  }, [query, allItems])

  // ------- Recent items -------
  const recentItems = useMemo<CommandItem[]>(() => {
    if (query.trim()) return [] // hide recent when searching
    const map = new Map(allItems.map((i) => [i.id, i]))
    return recentIds.map((id) => map.get(id)).filter(Boolean) as CommandItem[]
  }, [query, recentIds, allItems])

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // ------- Actions -------
  const openPalette = useCallback(() => {
    setQuery("")
    setSelectedIndex(0)
    setOpen(true)
  }, [])

  const closePalette = useCallback(() => {
    setOpen(false)
  }, [])

  const selectItem = useCallback(
    (item: CommandItem) => {
      // Record in recents
      const updated = [item.id, ...recentIds.filter((id) => id !== item.id)].slice(0, MAX_RECENT)
      setRecentIds(updated)
      saveRecent(updated)

      closePalette()
      item.onSelect()
    },
    [recentIds, closePalette],
  )

  // The flat list shown to the user (either search results or recent)
  const visibleItems: CommandItem[] = query.trim()
    ? results.map((r) => r.item)
    : recentItems

  const matchIndicesMap = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const r of results) {
      m.set(r.item.id, r.matchIndices)
    }
    return m
  }, [results])

  return {
    open,
    query,
    setQuery,
    selectedIndex,
    setSelectedIndex,
    openPalette,
    closePalette,
    selectItem,
    visibleItems,
    matchIndicesMap,
    allItems,
    isSearching: query.trim().length > 0,
  }
}

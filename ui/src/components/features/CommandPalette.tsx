import { useEffect, useRef, useCallback, type JSX } from "react"
import { Search, FileText, Bot, MessageSquare, Zap, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useCommandPalette, type CommandItemKind } from "@/hooks/useCommandPalette"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Render a label with fuzzy-matched characters highlighted. */
function HighlightedLabel({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>
  const set = new Set(indices)
  const parts: JSX.Element[] = []
  let buf = ""
  let inHighlight = false

  for (let i = 0; i <= text.length; i++) {
    const isMatch = set.has(i)
    if (i === text.length || isMatch !== inHighlight) {
      if (buf) {
        parts.push(
          inHighlight ? (
            <span key={i} className="text-primary font-semibold">
              {buf}
            </span>
          ) : (
            <span key={i}>{buf}</span>
          ),
        )
      }
      buf = ""
      inHighlight = isMatch
    }
    if (i < text.length) buf += text[i]
  }

  return <>{parts}</>
}

const kindIcons: Record<CommandItemKind, typeof FileText> = {
  page: FileText,
  agent: Bot,
  session: MessageSquare,
  action: Zap,
}

const kindLabels: Record<CommandItemKind, string> = {
  page: "Page",
  agent: "Agent",
  session: "Session",
  action: "Action",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const {
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
    isSearching,
  } = useCommandPalette()

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // ---- Global Cmd+K / Ctrl+K listener ----
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (open) {
          closePalette()
        } else {
          openPalette()
        }
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, openPalette, closePalette])

  // ---- Focus input when opened ----
  useEffect(() => {
    if (open) {
      // Small delay so the DOM is ready
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // ---- Scroll selected item into view ----
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  // ---- Keyboard navigation inside the palette ----
  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, visibleItems.length - 1))
          break
        case "ArrowUp":
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case "Enter":
          e.preventDefault()
          if (visibleItems[selectedIndex]) {
            selectItem(visibleItems[selectedIndex])
          }
          break
        case "Escape":
          e.preventDefault()
          closePalette()
          break
      }
    },
    [visibleItems, selectedIndex, setSelectedIndex, selectItem, closePalette],
  )

  if (!open) return null

  const showRecent = !isSearching && visibleItems.length > 0
  const showEmpty = isSearching && visibleItems.length === 0
  const showHint = !isSearching && visibleItems.length === 0

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={closePalette}
      role="presentation"
    >
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Palette container */}
      <div
        className={cn(
          "relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border",
          "bg-card shadow-2xl shadow-black/20",
          "animate-in fade-in slide-in-from-top-2 duration-150",
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Search pages, agents, sessions, actions…"
            className={cn(
              "flex-1 bg-transparent py-3 text-sm text-foreground outline-none",
              "placeholder:text-muted-foreground",
            )}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        {/* Results list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto overscroll-contain p-2">
          {showRecent && (
            <div className="mb-1 flex items-center gap-1.5 px-2 py-1">
              <Clock className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Recent</span>
            </div>
          )}

          {showHint && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              Type to search pages, agents, sessions & actions…
            </p>
          )}

          {showEmpty && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}

          {visibleItems.map((item, idx) => {
            const KindIcon = kindIcons[item.kind]
            const isSelected = idx === selectedIndex
            const indices = matchIndicesMap.get(item.id) ?? []

            return (
              <button
                key={item.id}
                data-index={idx}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                  isSelected
                    ? "bg-primary/10 text-foreground"
                    : "text-foreground/80 hover:bg-secondary",
                )}
                onClick={() => selectItem(item)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                {/* Icon */}
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-base">
                  {item.icon ?? <KindIcon className="h-4 w-4" />}
                </span>

                {/* Text */}
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">
                    <HighlightedLabel text={item.label} indices={indices} />
                  </span>
                  {item.description && (
                    <span className="truncate text-xs text-muted-foreground">
                      {item.description}
                    </span>
                  )}
                </div>

                {/* Right side badge / shortcut */}
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                    {kindLabels[item.kind]}
                  </span>
                  {item.shortcut && (
                    <kbd className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-border px-4 py-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <kbd className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <kbd className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <kbd className="rounded bg-secondary px-1 py-0.5 font-mono text-[10px]">esc</kbd>
            close
          </span>
        </div>
      </div>
    </div>
  )
}

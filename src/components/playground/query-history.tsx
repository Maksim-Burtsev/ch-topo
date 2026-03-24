import { AlertCircle, Clock, Search, Trash2, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { HistoryEntry } from '@/lib/playground/history'
import {
  clearHistory,
  filterHistory,
  formatTimestamp,
  getHistory,
  truncateSql,
} from '@/lib/playground/history'
import { formatElapsed } from '@/lib/playground/query-stats-format'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────

interface QueryHistoryProps {
  open: boolean
  onClose: () => void
  onSelect: (sql: string) => void
  className?: string
}

// ── Component ────────────────────────────────────────────────

export function QueryHistory({ open, onClose, onSelect, className }: QueryHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [prevOpen, setPrevOpen] = useState(false)

  // Refresh entries when panel opens (avoids setState-in-effect)
  if (open && !prevOpen) {
    setEntries(getHistory())
    setPrevOpen(true)
  }
  if (!open && prevOpen) {
    setPrevOpen(false)
  }

  const filtered = useMemo(() => filterHistory(entries, searchQuery), [entries, searchQuery])

  const handleClear = useCallback(() => {
    clearHistory()
    setEntries([])
  }, [])

  const handleSelect = useCallback(
    (sql: string) => {
      onSelect(sql)
      onClose()
    },
    [onSelect, onClose],
  )

  if (!open) return null

  return (
    <div
      className={cn('flex h-full w-80 flex-col border-l border-border bg-background', className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Query History
        </div>
        <div className="flex items-center gap-1">
          {entries.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Clear history"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter queries..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
            }}
            className="h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            {entries.length === 0 ? 'No queries yet' : 'No matching queries'}
          </div>
        )}

        {filtered.map((entry) => (
          <HistoryItem key={entry.id} entry={entry} onSelect={handleSelect} />
        ))}
      </div>
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────

interface HistoryItemProps {
  entry: HistoryEntry
  onSelect: (sql: string) => void
}

function HistoryItem({ entry, onSelect }: HistoryItemProps) {
  return (
    <button
      type="button"
      onClick={() => {
        onSelect(entry.sql)
      }}
      className="group w-full border-b border-border/50 px-3 py-2 text-left transition-colors hover:bg-secondary/50"
    >
      <div className="font-mono text-xs text-foreground/90 leading-snug">
        {truncateSql(entry.sql)}
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{formatTimestamp(entry.timestamp)}</span>
        <span className="text-muted-foreground/40">·</span>
        <span>{formatElapsed(entry.elapsed)}</span>
        {entry.rowsReturned > 0 && (
          <>
            <span className="text-muted-foreground/40">·</span>
            <span>{entry.rowsReturned.toLocaleString()} rows</span>
          </>
        )}
        {entry.error && (
          <span className="inline-flex items-center gap-0.5 text-destructive">
            <AlertCircle className="h-2.5 w-2.5" />
            error
          </span>
        )}
      </div>
    </button>
  )
}

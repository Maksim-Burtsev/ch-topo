import {
  AlertCircle,
  Bookmark,
  BookmarkPlus,
  Check,
  Clock,
  Edit3,
  Play,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { HistoryEntry } from '@/lib/playground/history'
import {
  clearHistory,
  filterHistory,
  formatTimestamp,
  getHistory,
  removeSavedQuery,
  renameSavedQuery,
  saveQuery,
  truncateSql,
} from '@/lib/playground/history'
import { formatElapsed } from '@/lib/playground/query-stats-format'
import { cn } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────

interface QueryHistoryProps {
  open: boolean
  onClose: () => void
  onSelect: (sql: string) => void
  onRun: (sql: string) => void
  refreshKey?: number
  className?: string
}

type HistoryTab = 'recent' | 'saved'

// ── Component ────────────────────────────────────────────────

export function QueryHistory({
  open,
  onClose,
  onSelect,
  onRun,
  refreshKey = 0,
  className,
}: QueryHistoryProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [tab, setTab] = useState<HistoryTab>('recent')
  const [prevOpen, setPrevOpen] = useState(false)
  const [prevRefreshKey, setPrevRefreshKey] = useState(refreshKey)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')

  // Refresh entries when panel opens or caller mutates storage.
  if (open && (!prevOpen || prevRefreshKey !== refreshKey)) {
    setEntries(getHistory())
    setPrevOpen(true)
    setPrevRefreshKey(refreshKey)
  }
  if (!open && prevOpen) {
    setPrevOpen(false)
  }

  const recentEntries = useMemo(() => entries.filter((entry) => !entry.saved), [entries])
  const savedEntries = useMemo(
    () =>
      entries
        .filter((entry) => entry.saved)
        .sort((a, b) => (b.savedAt ?? b.timestamp) - (a.savedAt ?? a.timestamp)),
    [entries],
  )
  const activeEntries = tab === 'recent' ? recentEntries : savedEntries
  const filtered = useMemo(
    () => filterHistory(activeEntries, searchQuery),
    [activeEntries, searchQuery],
  )
  let emptyMessage = 'No matching queries'
  if (activeEntries.length === 0) {
    emptyMessage = tab === 'saved' ? 'No saved queries' : 'No recent queries'
  }

  const handleClear = useCallback(() => {
    clearHistory()
    setEntries(getHistory())
  }, [])

  const handleSelect = useCallback(
    (sql: string) => {
      onSelect(sql)
      onClose()
    },
    [onSelect, onClose],
  )

  const handleRun = useCallback(
    (sql: string) => {
      onRun(sql)
      onClose()
    },
    [onRun, onClose],
  )

  const handleSave = useCallback((entry: HistoryEntry) => {
    saveQuery(entry.sql)
    setEntries(getHistory())
    setTab('saved')
  }, [])

  const handleStartRename = useCallback((entry: HistoryEntry) => {
    setRenamingId(entry.id)
    setDraftTitle(entry.title ?? truncateSql(entry.sql, 48))
  }, [])

  const handleRename = useCallback(
    (entry: HistoryEntry) => {
      renameSavedQuery(entry.id, draftTitle)
      setEntries(getHistory())
      setRenamingId(null)
      setDraftTitle('')
    },
    [draftTitle],
  )

  const handleRemoveSaved = useCallback((entry: HistoryEntry) => {
    removeSavedQuery(entry.id)
    setEntries(getHistory())
  }, [])

  if (!open) return null

  return (
    <div
      className={cn(
        'fixed inset-y-0 right-0 z-50 flex w-[min(22rem,calc(100vw-3.5rem))] flex-col border-l border-border bg-background shadow-xl lg:static lg:z-auto lg:h-full lg:w-80 lg:shadow-none',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Queries
        </div>
        <div className="flex items-center gap-1">
          {recentEntries.length > 0 && tab === 'recent' && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="Clear recent queries"
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

      <div className="grid grid-cols-2 gap-1 border-b border-border p-2">
        <TabButton
          active={tab === 'recent'}
          label="Recent"
          count={recentEntries.length}
          onClick={() => {
            setTab('recent')
          }}
        />
        <TabButton
          active={tab === 'saved'}
          label="Saved"
          count={savedEntries.length}
          onClick={() => {
            setTab('saved')
          }}
        />
      </div>

      {/* Search */}
      <div className="border-b border-border px-3 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder={tab === 'saved' ? 'Filter saved...' : 'Filter recent...'}
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
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">{emptyMessage}</div>
        )}

        {filtered.map((entry) => (
          <HistoryItem
            key={entry.id}
            entry={entry}
            tab={tab}
            renaming={renamingId === entry.id}
            draftTitle={draftTitle}
            onDraftTitleChange={setDraftTitle}
            onSelect={handleSelect}
            onRun={handleRun}
            onSave={handleSave}
            onStartRename={handleStartRename}
            onRename={handleRename}
            onRemoveSaved={handleRemoveSaved}
          />
        ))}
      </div>
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────

function TabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count: number
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
        active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {label}
      <span className="rounded bg-background/70 px-1 text-[10px] text-muted-foreground">
        {count}
      </span>
    </button>
  )
}

interface HistoryItemProps {
  entry: HistoryEntry
  tab: HistoryTab
  renaming: boolean
  draftTitle: string
  onDraftTitleChange: (title: string) => void
  onSelect: (sql: string) => void
  onRun: (sql: string) => void
  onSave: (entry: HistoryEntry) => void
  onStartRename: (entry: HistoryEntry) => void
  onRename: (entry: HistoryEntry) => void
  onRemoveSaved: (entry: HistoryEntry) => void
}

function HistoryItem({
  entry,
  tab,
  renaming,
  draftTitle,
  onDraftTitleChange,
  onSelect,
  onRun,
  onSave,
  onStartRename,
  onRename,
  onRemoveSaved,
}: HistoryItemProps) {
  const meta = (
    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
      <span>{formatTimestamp(entry.savedAt ?? entry.timestamp)}</span>
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
  )

  return (
    <div className="group border-b border-border/50 px-3 py-2 transition-colors hover:bg-secondary/50">
      {renaming && tab === 'saved' ? (
        <>
          <SavedTitle
            entry={entry}
            renaming={renaming}
            draftTitle={draftTitle}
            onDraftTitleChange={onDraftTitleChange}
            onRename={onRename}
          />
          {meta}
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            onSelect(entry.sql)
          }}
          className="w-full text-left"
        >
          {tab === 'saved' ? (
            <SavedTitle
              entry={entry}
              renaming={false}
              draftTitle={draftTitle}
              onDraftTitleChange={onDraftTitleChange}
              onRename={onRename}
            />
          ) : (
            <div className="font-mono text-xs leading-snug text-foreground/90">
              {truncateSql(entry.sql)}
            </div>
          )}

          {tab === 'saved' && (
            <div className="mt-1 font-mono text-[10px] leading-snug text-muted-foreground">
              {truncateSql(entry.sql, 96)}
            </div>
          )}
          {meta}
        </button>
      )}

      <div className="mt-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
        {tab === 'saved' ? (
          <>
            <ActionButton
              title="Run saved query"
              onClick={() => {
                onRun(entry.sql)
              }}
            >
              <Play className="h-3 w-3" />
              Run
            </ActionButton>
            <IconButton
              title="Rename saved query"
              onClick={() => {
                onStartRename(entry)
              }}
            >
              <Edit3 className="h-3 w-3" />
            </IconButton>
            <IconButton
              title="Delete saved query"
              danger
              onClick={() => {
                onRemoveSaved(entry)
              }}
            >
              <Trash2 className="h-3 w-3" />
            </IconButton>
          </>
        ) : (
          <ActionButton
            title="Save query"
            onClick={() => {
              onSave(entry)
            }}
          >
            <BookmarkPlus className="h-3 w-3" />
            Save
          </ActionButton>
        )}
      </div>
    </div>
  )
}

function SavedTitle({
  entry,
  renaming,
  draftTitle,
  onDraftTitleChange,
  onRename,
}: {
  entry: HistoryEntry
  renaming: boolean
  draftTitle: string
  onDraftTitleChange: (title: string) => void
  onRename: (entry: HistoryEntry) => void
}) {
  if (renaming) {
    return (
      <form
        onClick={(event) => {
          event.stopPropagation()
        }}
        onSubmit={(event) => {
          event.preventDefault()
          onRename(entry)
        }}
        className="flex items-center gap-1"
      >
        <input
          value={draftTitle}
          onChange={(event) => {
            onDraftTitleChange(event.target.value)
          }}
          className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          autoFocus
        />
        <button
          type="submit"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="Save name"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </form>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
      <Bookmark className="h-3 w-3 text-primary" />
      <span className="min-w-0 truncate">{entry.title ?? truncateSql(entry.sql, 48)}</span>
    </div>
  )
}

function ActionButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-[10px] text-secondary-foreground transition-colors hover:bg-secondary/80"
    >
      {children}
    </button>
  )
}

function IconButton({
  title,
  onClick,
  children,
  danger = false,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={cn(
        'rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
        danger && 'hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      {children}
    </button>
  )
}

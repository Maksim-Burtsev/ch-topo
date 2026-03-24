import { AlertTriangle, Calendar, History, User, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { DatabaseFilter } from '@/components/shared/database-filter'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { getEffectiveDatabase } from '@/lib/database-utils'
import { getAuthor, getOperationVariant, parseEventDate } from '@/lib/history-utils'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores/connection-store'
import { useDatabaseFilterStore } from '@/stores/database-filter-store'
import { useHistoryStore } from '@/stores/history-store'

const OPERATION_TYPES = ['Create', 'Alter', 'Drop', 'Rename'] as const

type DatePreset = '' | 'today' | '7d' | '30d' | 'custom'

function startOfDay(d: Date): Date {
  const copy = new Date(d)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return startOfDay(d)
}

function SkeletonEntry() {
  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      <div className="relative z-10 mt-1.5">
        <div className="h-[10px] w-[10px] rounded-full bg-muted animate-pulse" />
      </div>
      <div className="flex-1 rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="h-4 w-40 rounded bg-muted animate-pulse" />
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-12 w-full rounded bg-muted/50 animate-pulse" />
      </div>
    </div>
  )
}

export function HistoryPage() {
  const { status, entries, error, loadHistory } = useHistoryStore()
  const selectedDatabase = useDatabaseFilterStore((s) => s.selectedDatabase)
  const setSelectedDatabase = useDatabaseFilterStore((s) => s.setSelectedDatabase)
  const [authorFilter, setAuthorFilter] = useState('')
  const [operationFilters, setOperationFilters] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  const authors = useMemo(() => {
    const set = new Set(entries.map(getAuthor))
    return Array.from(set).sort()
  }, [entries])

  const databases = useMemo(() => {
    const set = new Set(entries.map((e) => e.current_database).filter(Boolean))
    return Array.from(set).sort()
  }, [entries])

  const databaseFilter = getEffectiveDatabase(selectedDatabase, databases)

  const hasActiveFilters =
    authorFilter !== '' ||
    selectedDatabase !== '' ||
    operationFilters.length > 0 ||
    statusFilter !== '' ||
    datePreset !== ''

  function toggleOperation(op: string) {
    setOperationFilters((prev) =>
      prev.includes(op) ? prev.filter((o) => o !== op) : [...prev, op],
    )
  }

  function resetFilters() {
    setAuthorFilter('')
    setSelectedDatabase('')
    setOperationFilters([])
    setStatusFilter('')
    setDatePreset('')
    setCustomFrom('')
    setCustomTo('')
  }

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (authorFilter && getAuthor(e) !== authorFilter) return false
      if (databaseFilter && e.current_database !== databaseFilter) return false
      if (operationFilters.length > 0 && !operationFilters.includes(e.query_kind)) return false
      if (statusFilter === 'success' && e.type !== 'QueryFinish') return false
      if (statusFilter === 'failed' && e.type !== 'ExceptionWhileProcessing') return false

      if (datePreset) {
        const eventDate = parseEventDate(e.event_time)
        switch (datePreset) {
          case 'today':
            if (eventDate < startOfDay(new Date())) return false
            break
          case '7d':
            if (eventDate < daysAgo(7)) return false
            break
          case '30d':
            if (eventDate < daysAgo(30)) return false
            break
          case 'custom':
            if (customFrom) {
              const from = new Date(customFrom)
              from.setHours(0, 0, 0, 0)
              if (eventDate < from) return false
            }
            if (customTo) {
              const to = new Date(customTo)
              to.setHours(23, 59, 59, 999)
              if (eventDate > to) return false
            }
            break
        }
      }

      return true
    })
  }, [
    entries,
    authorFilter,
    databaseFilter,
    operationFilters,
    statusFilter,
    datePreset,
    customFrom,
    customTo,
  ])

  useEffect(() => {
    if (status === 'idle') {
      const params = useConnectionStore.getState().getParams()
      void loadHistory(params)
    }
  }, [status, loadHistory])

  if (status === 'loading') {
    return (
      <div className="max-w-3xl">
        <p className="mb-6 text-sm text-muted-foreground">
          Recent DDL operations from system.query_log.
        </p>
        <div className="relative">
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-0">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonEntry key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-3xl">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle size={16} className="mt-0.5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">Could not load DDL history</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {error ?? 'Access to system.query_log may require additional permissions.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="max-w-3xl">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
            <History size={24} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No DDL history found</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            ClickHouse may not have query_log enabled, or no DDL operations have been recorded yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Recent DDL operations from system.query_log.
        </p>
        <span className="text-xs text-muted-foreground">
          Showing {filtered.length} of {entries.length} changes
        </span>
      </div>

      {/* Filter bar: dropdowns */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {databases.length > 1 && <DatabaseFilter databases={databases} className="w-40" />}
        {authors.length > 1 && (
          <Select
            className="w-40"
            value={authorFilter}
            onChange={(e) => {
              setAuthorFilter(e.target.value)
            }}
          >
            <option value="">All authors</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        )}
        <Select
          className="w-36"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value)
          }}
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </Select>
        <Select
          className="w-36"
          value={datePreset}
          onChange={(e) => {
            setDatePreset(e.target.value as DatePreset)
          }}
        >
          <option value="">All time</option>
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="custom">Custom range</option>
        </Select>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={12} />
            Reset
          </button>
        )}
      </div>

      {/* Custom date range inputs */}
      {datePreset === 'custom' && (
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={14} className="text-muted-foreground" />
          <input
            type="date"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value)
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value)
            }}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      )}

      {/* Operation type chips */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground mr-1">Operations:</span>
        {OPERATION_TYPES.map((op) => {
          const isSelected = operationFilters.includes(op)
          return (
            <button
              key={op}
              type="button"
              onClick={() => {
                toggleOperation(op)
              }}
              className="transition-opacity"
            >
              <Badge
                variant={getOperationVariant(op)}
                className={cn(
                  'cursor-pointer select-none',
                  !isSelected && operationFilters.length > 0 && 'opacity-40',
                )}
              >
                {op}
                {isSelected && <X size={10} className="ml-1" />}
              </Badge>
            </button>
          )
        })}
      </div>

      {/* Timeline */}
      <div className="relative">
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-0">
          {filtered.length === 0 && hasActiveFilters && (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <p className="text-sm font-medium text-muted-foreground">No matching changes</p>
              <p className="mt-1 text-xs text-muted-foreground">Try adjusting your filters.</p>
            </div>
          )}
          {filtered.map((entry, i) => {
            const isSuccess = entry.type === 'QueryFinish'
            const durationMs = Number(entry.query_duration_ms) || 0
            const author = getAuthor(entry)

            return (
              <div key={i} className="relative flex gap-4 pb-8 last:pb-0">
                <div className="relative z-10 mt-1.5">
                  <div
                    className={`h-[10px] w-[10px] rounded-full border-2 ${
                      isSuccess
                        ? 'border-emerald-500 bg-emerald-500/20'
                        : 'border-red-500 bg-red-500/20'
                    }`}
                  />
                </div>

                <div className="flex-1 rounded-lg border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{entry.event_time}</span>
                      <Badge variant={isSuccess ? 'mergetree' : 'destructive'}>
                        {isSuccess ? 'applied' : 'failed'}
                      </Badge>
                      <Badge
                        variant={getOperationVariant(entry.query_kind)}
                        className="text-[10px] px-1.5 py-0"
                      >
                        {entry.query_kind}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{durationMs}ms</span>
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                        <User size={10} className="text-muted-foreground/70" />
                        {author}
                      </span>
                    </div>
                  </div>
                  <pre className="rounded bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
                    {entry.query}
                  </pre>
                  {entry.exception && (
                    <p className="mt-2 text-xs text-red-400 leading-relaxed">{entry.exception}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const STORAGE_KEY = 'chtopo_query_history'
const MAX_RECENT_ENTRIES = 100

// ── Types ────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  sql: string
  timestamp: number
  elapsed: number
  rowsReturned: number
  error: boolean
  saved?: boolean
  title?: string
  savedAt?: number
}

// ── Storage helpers ──────────────────────────────────────────

function loadEntries(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as HistoryEntry[]
  } catch {
    return []
  }
}

function saveEntries(entries: HistoryEntry[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

function makeId(timestamp: number): string {
  return `${timestamp}-${Math.random().toString(36).slice(2, 8)}`
}

function limitEntries(entries: HistoryEntry[]): HistoryEntry[] {
  const saved = entries.filter((entry) => entry.saved)
  const recent = entries.filter((entry) => !entry.saved).slice(0, MAX_RECENT_ENTRIES)
  return [...saved, ...recent]
}

function titleFromSql(sql: string): string {
  const firstLine = truncateSql(sql.trim(), 48)
  return firstLine || 'Untitled query'
}

function normalizeTitle(title?: string): string | undefined {
  const trimmed = title?.trim()
  if (trimmed === '') return undefined
  return trimmed
}

// ── Public API ───────────────────────────────────────────────

export function addToHistory(entry: Omit<HistoryEntry, 'id'>): HistoryEntry {
  const entries = loadEntries()
  const full: HistoryEntry = {
    ...entry,
    id: makeId(entry.timestamp),
  }
  entries.unshift(full)
  saveEntries(limitEntries(entries))
  return full
}

export function getHistory(): HistoryEntry[] {
  return loadEntries()
}

export function getRecentQueries(): HistoryEntry[] {
  return loadEntries().filter((entry) => !entry.saved)
}

export function getSavedQueries(): HistoryEntry[] {
  return loadEntries()
    .filter((entry) => entry.saved)
    .sort((a, b) => (b.savedAt ?? b.timestamp) - (a.savedAt ?? a.timestamp))
}

export function saveQuery(sql: string, title?: string): HistoryEntry {
  const now = Date.now()
  const entries = loadEntries()
  const existing = entries.find((entry) => entry.saved && entry.sql === sql)
  if (existing) {
    const updated: HistoryEntry = {
      ...existing,
      title: normalizeTitle(title) ?? existing.title ?? titleFromSql(sql),
      savedAt: existing.savedAt ?? now,
      saved: true,
    }
    saveEntries(entries.map((entry) => (entry.id === existing.id ? updated : entry)))
    return updated
  }

  const recentMatch = entries.find((entry) => entry.sql === sql)
  if (recentMatch) {
    const updated: HistoryEntry = {
      ...recentMatch,
      title: normalizeTitle(title) ?? recentMatch.title ?? titleFromSql(sql),
      saved: true,
      savedAt: now,
    }
    saveEntries(
      limitEntries(entries.map((entry) => (entry.id === recentMatch.id ? updated : entry))),
    )
    return updated
  }

  const saved: HistoryEntry = {
    id: makeId(now),
    sql,
    timestamp: now,
    elapsed: 0,
    rowsReturned: 0,
    error: false,
    saved: true,
    title: normalizeTitle(title) ?? titleFromSql(sql),
    savedAt: now,
  }

  saveEntries(limitEntries([saved, ...entries]))
  return saved
}

export function renameSavedQuery(id: string, title: string): HistoryEntry | null {
  const entries = loadEntries()
  const trimmed = title.trim()
  let renamed: HistoryEntry | null = null
  const next = entries.map((entry) => {
    if (entry.id !== id || !entry.saved) return entry
    renamed = { ...entry, title: trimmed || titleFromSql(entry.sql) }
    return renamed
  })
  saveEntries(next)
  return renamed
}

export function removeSavedQuery(id: string): void {
  saveEntries(loadEntries().filter((entry) => entry.id !== id))
}

export function clearHistory(): void {
  const saved = loadEntries().filter((entry) => entry.saved)
  if (saved.length === 0) {
    localStorage.removeItem(STORAGE_KEY)
    return
  }
  saveEntries(saved)
}

// ── Formatting helpers ───────────────────────────────────────

export function truncateSql(sql: string, maxLength = 80): string {
  const firstLine = sql.split('\n')[0] ?? sql
  if (firstLine.length <= maxLength) return firstLine
  return `${firstLine.slice(0, maxLength)}...`
}

export function formatTimestamp(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHour = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString()
}

export function filterHistory(entries: HistoryEntry[], query: string): HistoryEntry[] {
  if (!query.trim()) return entries
  const lower = query.toLowerCase()
  return entries.filter(
    (e) => e.sql.toLowerCase().includes(lower) || (e.title ?? '').toLowerCase().includes(lower),
  )
}

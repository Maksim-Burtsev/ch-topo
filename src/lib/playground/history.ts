const STORAGE_KEY = 'chtopo_query_history'
const MAX_ENTRIES = 100

// ── Types ────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  sql: string
  timestamp: number
  elapsed: number
  rowsReturned: number
  error: boolean
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

// ── Public API ───────────────────────────────────────────────

export function addToHistory(entry: Omit<HistoryEntry, 'id'>): HistoryEntry {
  const entries = loadEntries()
  const full: HistoryEntry = {
    ...entry,
    id: `${entry.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
  }
  entries.unshift(full)
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES
  }
  saveEntries(entries)
  return full
}

export function getHistory(): HistoryEntry[] {
  return loadEntries()
}

export function clearHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
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

export function filterHistory(
  entries: HistoryEntry[],
  query: string,
): HistoryEntry[] {
  if (!query.trim()) return entries
  const lower = query.toLowerCase()
  return entries.filter((e) => e.sql.toLowerCase().includes(lower))
}

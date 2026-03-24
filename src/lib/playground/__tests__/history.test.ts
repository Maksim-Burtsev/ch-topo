import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryEntry } from '@/lib/playground/history'
import {
  addToHistory,
  clearHistory,
  filterHistory,
  formatTimestamp,
  getHistory,
  truncateSql,
} from '@/lib/playground/history'

// ── localStorage mock ────────────────────────────────────────

const store = new Map<string, string>()

beforeEach(() => {
  store.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ── Tests ────────────────────────────────────────────────────

describe('addToHistory', () => {
  it('adds entry and assigns an id', () => {
    const entry = addToHistory({
      sql: 'SELECT 1',
      timestamp: Date.now(),
      elapsed: 0.05,
      rowsReturned: 1,
      error: false,
    })

    expect(entry.id).toBeTruthy()
    expect(entry.sql).toBe('SELECT 1')
  })

  it('prepends new entries (most recent first)', () => {
    addToHistory({
      sql: 'SELECT 1',
      timestamp: 1000,
      elapsed: 0.01,
      rowsReturned: 1,
      error: false,
    })
    addToHistory({
      sql: 'SELECT 2',
      timestamp: 2000,
      elapsed: 0.02,
      rowsReturned: 1,
      error: false,
    })

    const history = getHistory()
    expect(history).toHaveLength(2)
    expect(history[0]?.sql).toBe('SELECT 2')
    expect(history[1]?.sql).toBe('SELECT 1')
  })

  it('caps at 100 entries', () => {
    for (let i = 0; i < 105; i++) {
      addToHistory({
        sql: `SELECT ${i}`,
        timestamp: i * 1000,
        elapsed: 0.01,
        rowsReturned: 1,
        error: false,
      })
    }

    const history = getHistory()
    expect(history).toHaveLength(100)
    expect(history[0]?.sql).toBe('SELECT 104')
  })
})

describe('getHistory', () => {
  it('returns empty array when no history', () => {
    expect(getHistory()).toEqual([])
  })

  it('returns empty array for invalid JSON in storage', () => {
    store.set('chtopo_query_history', 'not json')
    expect(getHistory()).toEqual([])
  })

  it('returns empty array for non-array JSON', () => {
    store.set('chtopo_query_history', '{"key": "value"}')
    expect(getHistory()).toEqual([])
  })
})

describe('clearHistory', () => {
  it('removes all history', () => {
    addToHistory({
      sql: 'SELECT 1',
      timestamp: Date.now(),
      elapsed: 0.05,
      rowsReturned: 1,
      error: false,
    })

    expect(getHistory()).toHaveLength(1)

    clearHistory()
    expect(getHistory()).toEqual([])
  })
})

describe('truncateSql', () => {
  it('returns first line when short', () => {
    expect(truncateSql('SELECT 1')).toBe('SELECT 1')
  })

  it('returns only first line of multiline sql', () => {
    expect(truncateSql('SELECT *\nFROM events\nWHERE id = 1')).toBe('SELECT *')
  })

  it('truncates long first line', () => {
    const longSql = 'SELECT ' + 'a, '.repeat(50)
    const result = truncateSql(longSql, 80)
    expect(result).toHaveLength(83) // 80 + '...'
    expect(result.endsWith('...')).toBe(true)
  })

  it('uses custom max length', () => {
    expect(truncateSql('SELECT * FROM very_long_table_name', 20)).toBe('SELECT * FROM very_l...')
  })
})

describe('formatTimestamp', () => {
  it('shows "just now" for recent timestamps', () => {
    expect(formatTimestamp(Date.now())).toBe('just now')
  })

  it('shows minutes ago', () => {
    const fiveMinAgo = Date.now() - 5 * 60_000
    expect(formatTimestamp(fiveMinAgo)).toBe('5m ago')
  })

  it('shows hours ago', () => {
    const twoHoursAgo = Date.now() - 2 * 3_600_000
    expect(formatTimestamp(twoHoursAgo)).toBe('2h ago')
  })

  it('shows days ago', () => {
    const threeDaysAgo = Date.now() - 3 * 86_400_000
    expect(formatTimestamp(threeDaysAgo)).toBe('3d ago')
  })

  it('shows date for old entries', () => {
    const oldDate = Date.now() - 30 * 86_400_000
    const result = formatTimestamp(oldDate)
    // Should be a locale date string
    expect(result).not.toContain('ago')
  })
})

describe('filterHistory', () => {
  const entries: HistoryEntry[] = [
    {
      id: '1',
      sql: 'SELECT * FROM events',
      timestamp: 1000,
      elapsed: 0.1,
      rowsReturned: 10,
      error: false,
    },
    {
      id: '2',
      sql: 'SELECT count() FROM users',
      timestamp: 2000,
      elapsed: 0.2,
      rowsReturned: 1,
      error: false,
    },
    {
      id: '3',
      sql: 'INSERT INTO logs VALUES (1)',
      timestamp: 3000,
      elapsed: 0.05,
      rowsReturned: 0,
      error: true,
    },
  ]

  it('returns all entries when query is empty', () => {
    expect(filterHistory(entries, '')).toEqual(entries)
    expect(filterHistory(entries, '  ')).toEqual(entries)
  })

  it('filters by SQL content (case-insensitive)', () => {
    const results = filterHistory(entries, 'events')
    expect(results).toHaveLength(1)
    expect(results[0]?.sql).toContain('events')
  })

  it('matches partial strings', () => {
    const results = filterHistory(entries, 'SELECT')
    expect(results).toHaveLength(2)
  })

  it('returns empty for no match', () => {
    expect(filterHistory(entries, 'nonexistent')).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import type { RawTableRow } from '@/lib/clickhouse/types'
import { filterTables } from '../table-filter-utils'

function makeTable(overrides: Partial<RawTableRow> = {}): RawTableRow {
  return {
    database: 'default',
    name: 'events',
    engine: 'MergeTree',
    total_rows: '1000',
    total_bytes: '5000',
    data_compressed_bytes: '2000',
    create_table_query: '',
    sorting_key: 'id',
    partition_key: '',
    metadata_modification_time: '2026-03-15 00:00:00',
    ...overrides,
  }
}

const multiDbTables: RawTableRow[] = [
  makeTable({ database: 'analytics', name: 'events', engine: 'MergeTree' }),
  makeTable({ database: 'analytics', name: 'users', engine: 'ReplacingMergeTree' }),
  makeTable({ database: 'analytics', name: 'daily_stats_mv', engine: 'MaterializedView' }),
  makeTable({ database: 'staging', name: 'raw_events', engine: 'MergeTree' }),
  makeTable({ database: 'staging', name: 'raw_logs', engine: 'MergeTree' }),
  makeTable({ database: 'system', name: 'query_log', engine: 'MergeTree' }),
]

// ─── Database filter ──────────────────────────────────────────────────

describe('filterTables — database filter', () => {
  it('returns all tables when database filter is empty', () => {
    const result = filterTables(multiDbTables, '', '', [])
    expect(result).toHaveLength(6)
  })

  it('filters by a single database', () => {
    const result = filterTables(multiDbTables, '', 'analytics', [])
    expect(result).toHaveLength(3)
    expect(result.every((t) => t.database === 'analytics')).toBe(true)
  })

  it('returns empty when filtering by non-existent database', () => {
    const result = filterTables(multiDbTables, '', 'production', [])
    expect(result).toHaveLength(0)
  })

  it('handles single database scenario', () => {
    const singleDb = multiDbTables.filter((t) => t.database === 'system')
    const result = filterTables(singleDb, '', 'system', [])
    expect(result).toHaveLength(1)
    expect(result.at(0)?.name).toBe('query_log')
  })

  it('handles no tables (empty array)', () => {
    const result = filterTables([], '', 'analytics', [])
    expect(result).toHaveLength(0)
  })
})

// ─── Engine filter ────────────────────────────────────────────────────

describe('filterTables — engine filter', () => {
  it('filters by a single engine type', () => {
    const result = filterTables(multiDbTables, '', '', ['MergeTree'])
    expect(result).toHaveLength(4)
    expect(result.every((t) => t.engine === 'MergeTree')).toBe(true)
  })

  it('filters by multiple engine types', () => {
    const result = filterTables(multiDbTables, '', '', ['MergeTree', 'MaterializedView'])
    expect(result).toHaveLength(5)
  })

  it('returns empty when no tables match the engine filter', () => {
    const result = filterTables(multiDbTables, '', '', ['Distributed'])
    expect(result).toHaveLength(0)
  })
})

// ─── Combined database + engine filter ────────────────────────────────

describe('filterTables — combined database and engine filter', () => {
  it('applies both database and engine filters simultaneously', () => {
    const result = filterTables(multiDbTables, '', 'analytics', ['MergeTree'])
    expect(result).toHaveLength(1)
    expect(result.at(0)?.name).toBe('events')
    expect(result.at(0)?.database).toBe('analytics')
  })

  it('returns empty when database and engine combination has no matches', () => {
    const result = filterTables(multiDbTables, '', 'staging', ['MaterializedView'])
    expect(result).toHaveLength(0)
  })

  it('combines name search with database and engine filters', () => {
    const result = filterTables(multiDbTables, 'raw', 'staging', ['MergeTree'])
    expect(result).toHaveLength(2)
    expect(result.every((t) => t.database === 'staging' && t.name.includes('raw'))).toBe(true)
  })
})

// ─── Name filter ──────────────────────────────────────────────────────

describe('filterTables — name filter', () => {
  it('filters by name substring (case-insensitive)', () => {
    const result = filterTables(multiDbTables, 'EVENTS', '', [])
    expect(result).toHaveLength(2) // events, raw_events
    expect(result.every((t) => t.name.toLowerCase().includes('events'))).toBe(true)
  })

  it('returns all when name filter is empty', () => {
    const result = filterTables(multiDbTables, '', '', [])
    expect(result).toHaveLength(6)
  })

  it('returns empty when name matches nothing', () => {
    const result = filterTables(multiDbTables, 'nonexistent', '', [])
    expect(result).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import type {
  RawColumnRow,
  RawDictionaryRow,
  RawGrantRow,
  RawIndexRow,
  RawRowPolicyRow,
  RawTableRow,
} from '@/lib/clickhouse/types'
import { mockColumns, mockDictionaries, mockTables } from '@/lib/mock/data'
import { parseAction } from '@/lib/parser/action-parser'
import { buildDependencyGraph } from '../build-graph'
import { analyzeImpact, isTypeCompatible } from '../impact'
import type { DependencyGraph } from '../types'

// ─── Test Helpers ────────────────────────────────────────────────────

const rawTables: RawTableRow[] = mockTables.map((t) => ({
  database: t.database,
  name: t.name,
  engine: t.engine,
  total_rows: String(t.total_rows),
  total_bytes: String(t.total_bytes),
  data_compressed_bytes: String(t.compressed_bytes),
  create_table_query: t.create_table_query,
  sorting_key: t.sorting_key,
  partition_key: t.partition_key,
  metadata_modification_time: t.metadata_modification_time,
}))

const rawColumns: RawColumnRow[] = mockColumns
const rawDictionaries: RawDictionaryRow[] = mockDictionaries
const emptyIndices: RawIndexRow[] = []
const emptyPolicies: RawRowPolicyRow[] = []
const emptyGrants: RawGrantRow[] = []

function buildDefault(): DependencyGraph {
  return buildDependencyGraph(
    rawTables,
    rawColumns,
    emptyIndices,
    rawDictionaries,
    emptyPolicies,
    emptyGrants,
  )
}

function countBySeverity(impacts: { severity: string }[]) {
  return {
    break: impacts.filter((i) => i.severity === 'break').length,
    stale: impacts.filter((i) => i.severity === 'stale').length,
    warning: impacts.filter((i) => i.severity === 'warning').length,
  }
}

// ─── DROP COLUMN ─────────────────────────────────────────────────────

describe('DROP COLUMN', () => {
  it('events.user_id → 3 breaking, 2 stale, warnings', () => {
    const graph = buildDefault()
    const impacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'analytics.events', column: 'user_id' },
      graph,
    )
    const counts = countBySeverity(impacts)

    // 2 MV breaks + 1 ORDER BY break = 3 breaking
    expect(counts.break).toBe(3)
    // daily_stats + user_funnels targets stale
    expect(counts.stale).toBe(2)
    // SAMPLE BY + potentially others
    expect(counts.warning).toBeGreaterThanOrEqual(1)

    // Verify specific impacts
    const mvBreaks = impacts.filter((i) => i.severity === 'break' && i.objectType === 'mv')
    expect(mvBreaks.map((i) => i.objectName).sort()).toEqual([
      'analytics.daily_stats_mv',
      'analytics.user_funnels_mv',
    ])

    const orderByBreak = impacts.find((i) => i.severity === 'break' && i.objectType === 'order_by')
    expect(orderByBreak).toBeDefined()
    expect(orderByBreak?.objectName).toBe('analytics.events')

    const sampleWarning = impacts.find(
      (i) => i.severity === 'warning' && i.objectType === 'sample_by',
    )
    expect(sampleWarning).toBeDefined()
  })

  it('events.event_date → ORDER BY + PARTITION BY break, TTL warning', () => {
    const graph = buildDefault()
    const impacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'analytics.events', column: 'event_date' },
      graph,
    )
    const counts = countBySeverity(impacts)

    // 2 MV breaks + ORDER BY + PARTITION BY = 4 breaking
    expect(counts.break).toBe(4)
    // 2 target tables stale
    expect(counts.stale).toBe(2)

    const ttlWarning = impacts.find((i) => i.severity === 'warning' && i.objectType === 'ttl')
    expect(ttlWarning).toBeDefined()
    expect(ttlWarning?.column).toBe('event_date')
  })

  it('column without dependencies → empty impacts (safe)', () => {
    const graph = buildDefault()
    const impacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'analytics.events', column: 'city' },
      graph,
    )
    expect(impacts).toEqual([])
  })

  it('detects index column warnings', () => {
    const indices: RawIndexRow[] = [
      {
        database: 'analytics',
        table: 'events',
        name: 'idx_user',
        expr: 'user_id',
        type: 'set(100)',
      },
    ]
    const graph = buildDependencyGraph(
      rawTables,
      rawColumns,
      indices,
      rawDictionaries,
      emptyPolicies,
      emptyGrants,
    )
    const impacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'analytics.events', column: 'user_id' },
      graph,
    )

    const indexWarning = impacts.find((i) => i.objectType === 'index')
    expect(indexWarning).toBeDefined()
    expect(indexWarning?.severity).toBe('warning')
    expect(indexWarning?.objectName).toBe('idx_user')
  })

  it('detects column grant warnings', () => {
    const grants: RawGrantRow[] = [
      {
        user_name: '',
        role_name: 'analyst_role',
        database: 'analytics',
        table: 'events',
        column: 'user_id',
        grant_option: 0,
      },
    ]
    const graph = buildDependencyGraph(
      rawTables,
      rawColumns,
      emptyIndices,
      rawDictionaries,
      emptyPolicies,
      grants,
    )
    const impacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'analytics.events', column: 'user_id' },
      graph,
    )

    const grantWarning = impacts.find((i) => i.objectType === 'grant')
    expect(grantWarning).toBeDefined()
    expect(grantWarning?.severity).toBe('warning')
    expect(grantWarning?.objectName).toBe('analyst_role')
  })

  it('detects row policy warnings', () => {
    const policies: RawRowPolicyRow[] = [
      {
        name: 'analytics.events.country_filter',
        short_name: 'country_filter',
        database: 'analytics',
        table: 'events',
        select_filter: "country = 'US'",
      },
    ]
    const graph = buildDependencyGraph(
      rawTables,
      rawColumns,
      emptyIndices,
      rawDictionaries,
      policies,
      emptyGrants,
    )
    const impacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'analytics.events', column: 'country' },
      graph,
    )

    const policyWarning = impacts.find((i) => i.objectType === 'row_policy')
    expect(policyWarning).toBeDefined()
    expect(policyWarning?.severity).toBe('warning')
  })
})

// ─── DROP TABLE ──────────────────────────────────────────────────────

describe('DROP TABLE', () => {
  it('events → all dependent MVs, targets stale', () => {
    const graph = buildDefault()
    const impacts = analyzeImpact({ type: 'DROP_TABLE', table: 'analytics.events' }, graph)
    const counts = countBySeverity(impacts)

    // 2 MVs broken
    expect(counts.break).toBe(2)
    // 2 target tables stale
    expect(counts.stale).toBe(2)

    const mvBreaks = impacts.filter((i) => i.severity === 'break' && i.objectType === 'mv')
    expect(mvBreaks.map((i) => i.objectName).sort()).toEqual([
      'analytics.daily_stats_mv',
      'analytics.user_funnels_mv',
    ])

    const staleTargets = impacts.filter(
      (i) => i.severity === 'stale' && i.objectType === 'target_table',
    )
    expect(staleTargets.map((i) => i.objectName).sort()).toEqual([
      'analytics.daily_stats',
      'analytics.user_funnels',
    ])
  })

  it('drop table with dict dependency → dict breaks', () => {
    // regions dict sources from analytics.regions_source
    const graph = buildDefault()
    const impacts = analyzeImpact({ type: 'DROP_TABLE', table: 'analytics.regions_source' }, graph)

    const dictBreak = impacts.find((i) => i.objectType === 'dictionary')
    expect(dictBreak).toBeDefined()
    expect(dictBreak?.severity).toBe('break')
    expect(dictBreak?.objectName).toBe('analytics.regions')
  })

  it('drop table with distributed/buffer → stale', () => {
    const graph = buildDefault()
    // Manually add distributed and buffer deps pointing to events
    graph.distributedTables.set('analytics.events_dist', 'analytics.events')
    graph.bufferTables.set('analytics.events_buf', 'analytics.events')

    const impacts = analyzeImpact({ type: 'DROP_TABLE', table: 'analytics.events' }, graph)

    const distStale = impacts.find((i) => i.objectType === 'distributed')
    expect(distStale).toBeDefined()
    expect(distStale?.severity).toBe('stale')

    const bufStale = impacts.find((i) => i.objectType === 'buffer')
    expect(bufStale).toBeDefined()
    expect(bufStale?.severity).toBe('stale')
  })
})

// ─── MODIFY COLUMN ──────────────────────────────────────────────────

describe('MODIFY COLUMN', () => {
  it('UInt32 → UInt64 → safe (widening)', () => {
    const graph = buildDefault()
    // Override user_id type to UInt32 to test widening
    graph.columnTypes.set('analytics.events.user_id', 'UInt32')

    const impacts = analyzeImpact(
      { type: 'MODIFY_COLUMN', table: 'analytics.events', column: 'user_id', newType: 'UInt64' },
      graph,
    )
    expect(impacts).toEqual([])
  })

  it('UInt64 → String → break (incompatible)', () => {
    const graph = buildDefault()
    const impacts = analyzeImpact(
      { type: 'MODIFY_COLUMN', table: 'analytics.events', column: 'user_id', newType: 'String' },
      graph,
    )

    expect(impacts.length).toBeGreaterThan(0)
    // All impacts should mention incompatible type change
    const breakImpacts = impacts.filter((i) => i.severity === 'break')
    expect(breakImpacts.length).toBeGreaterThan(0)
    expect(breakImpacts[0]?.reason).toContain('Incompatible type change')
  })

  it('same type → safe', () => {
    const graph = buildDefault()
    const impacts = analyzeImpact(
      { type: 'MODIFY_COLUMN', table: 'analytics.events', column: 'user_id', newType: 'UInt64' },
      graph,
    )
    expect(impacts).toEqual([])
  })
})

// ─── RENAME COLUMN ──────────────────────────────────────────────────

describe('RENAME COLUMN', () => {
  it('same as DROP — all references break', () => {
    const graph = buildDefault()
    const dropImpacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'analytics.events', column: 'user_id' },
      graph,
    )
    const renameImpacts = analyzeImpact(
      {
        type: 'RENAME_COLUMN',
        table: 'analytics.events',
        oldName: 'user_id',
        newName: 'uid',
      },
      graph,
    )

    // Same number of impacts with same severities
    expect(countBySeverity(renameImpacts)).toEqual(countBySeverity(dropImpacts))
    expect(renameImpacts.length).toBe(dropImpacts.length)
  })
})

// ─── Type Compatibility ─────────────────────────────────────────────

describe('isTypeCompatible', () => {
  it('same type is compatible', () => {
    expect(isTypeCompatible('UInt64', 'UInt64')).toBe(true)
  })

  it('UInt widening is compatible', () => {
    expect(isTypeCompatible('UInt8', 'UInt16')).toBe(true)
    expect(isTypeCompatible('UInt16', 'UInt32')).toBe(true)
    expect(isTypeCompatible('UInt32', 'UInt64')).toBe(true)
  })

  it('UInt narrowing is incompatible', () => {
    expect(isTypeCompatible('UInt64', 'UInt32')).toBe(false)
  })

  it('Float widening is compatible', () => {
    expect(isTypeCompatible('Float32', 'Float64')).toBe(true)
  })

  it('Date → DateTime is compatible', () => {
    expect(isTypeCompatible('Date', 'DateTime')).toBe(true)
    expect(isTypeCompatible('Date', 'DateTime64')).toBe(true)
  })

  it('LowCardinality(X) → X is compatible', () => {
    expect(isTypeCompatible('LowCardinality(String)', 'String')).toBe(true)
  })

  it('Nullable(X) → X is compatible', () => {
    expect(isTypeCompatible('Nullable(UInt64)', 'UInt64')).toBe(true)
  })

  it('numeric → String is incompatible', () => {
    expect(isTypeCompatible('UInt64', 'String')).toBe(false)
  })

  it('Date → UInt is incompatible', () => {
    expect(isTypeCompatible('Date', 'UInt32')).toBe(false)
  })

  it('cross-family is incompatible', () => {
    expect(isTypeCompatible('Float64', 'UInt64')).toBe(false)
    expect(isTypeCompatible('Int32', 'UInt32')).toBe(false)
  })
})

// ─── Action Parser ──────────────────────────────────────────────────

describe('parseAction', () => {
  it('parses DROP COLUMN', () => {
    expect(parseAction('ALTER TABLE analytics.events DROP COLUMN user_id')).toEqual({
      type: 'DROP_COLUMN',
      table: 'analytics.events',
      column: 'user_id',
    })
  })

  it('parses MODIFY COLUMN', () => {
    expect(parseAction('ALTER TABLE analytics.events MODIFY COLUMN user_id UInt32')).toEqual({
      type: 'MODIFY_COLUMN',
      table: 'analytics.events',
      column: 'user_id',
      newType: 'UInt32',
    })
  })

  it('parses MODIFY COLUMN with complex type', () => {
    const result = parseAction(
      'ALTER TABLE analytics.events MODIFY COLUMN user_id Nullable(UInt64)',
    )
    expect(result).toEqual({
      type: 'MODIFY_COLUMN',
      table: 'analytics.events',
      column: 'user_id',
      newType: 'Nullable(UInt64)',
    })
  })

  it('parses MODIFY COLUMN stripping trailing modifiers', () => {
    const result = parseAction(
      "ALTER TABLE analytics.events MODIFY COLUMN user_id UInt32 CODEC(Delta, ZSTD(1)) COMMENT 'uid'",
    )
    expect(result?.type).toBe('MODIFY_COLUMN')
    expect(result?.type === 'MODIFY_COLUMN' && result.newType).toBe('UInt32')
  })

  it('parses RENAME COLUMN', () => {
    expect(parseAction('ALTER TABLE analytics.events RENAME COLUMN user_id TO uid')).toEqual({
      type: 'RENAME_COLUMN',
      table: 'analytics.events',
      oldName: 'user_id',
      newName: 'uid',
    })
  })

  it('parses DROP TABLE', () => {
    expect(parseAction('DROP TABLE analytics.events')).toEqual({
      type: 'DROP_TABLE',
      table: 'analytics.events',
    })
  })

  it('parses with IF EXISTS', () => {
    expect(
      parseAction('ALTER TABLE IF EXISTS analytics.events DROP COLUMN IF EXISTS old_col'),
    ).toEqual({
      type: 'DROP_COLUMN',
      table: 'analytics.events',
      column: 'old_col',
    })
  })

  it('returns null for unrecognized SQL', () => {
    expect(parseAction('SELECT 1')).toBeNull()
    expect(parseAction('')).toBeNull()
    expect(parseAction('CREATE TABLE foo (id UInt64) ENGINE = MergeTree')).toBeNull()
  })

  it('handles trailing semicolons', () => {
    expect(parseAction('DROP TABLE analytics.events;')).toEqual({
      type: 'DROP_TABLE',
      table: 'analytics.events',
    })
  })
})

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
import { buildDependencyGraph } from '../build-graph'

// Convert mock TableInfo[] → RawTableRow[]
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

// ColumnInfo and RawColumnRow have the same shape
const rawColumns: RawColumnRow[] = mockColumns

// DictionaryInfo and RawDictionaryRow have the same shape
const rawDictionaries: RawDictionaryRow[] = mockDictionaries

const emptyIndices: RawIndexRow[] = []
const emptyPolicies: RawRowPolicyRow[] = []
const emptyGrants: RawGrantRow[] = []

function buildDefault() {
  return buildDependencyGraph(
    rawTables,
    rawColumns,
    emptyIndices,
    rawDictionaries,
    emptyPolicies,
    emptyGrants,
  )
}

// ─── MV Dependencies ──────────────────────────────────────────────────

describe('MV dependencies', () => {
  it('extracts mvSources for daily_stats_mv', () => {
    const graph = buildDefault()
    expect(graph.mvSources.get('analytics.daily_stats_mv')).toEqual(['analytics.events'])
  })

  it('extracts mvSources for user_funnels_mv', () => {
    const graph = buildDefault()
    expect(graph.mvSources.get('analytics.user_funnels_mv')).toEqual(['analytics.events'])
  })

  it('extracts mvTargets for daily_stats_mv', () => {
    const graph = buildDefault()
    expect(graph.mvTargets.get('analytics.daily_stats_mv')).toBe('analytics.daily_stats')
  })

  it('extracts mvTargets for user_funnels_mv', () => {
    const graph = buildDefault()
    expect(graph.mvTargets.get('analytics.user_funnels_mv')).toBe('analytics.user_funnels')
  })

  it('maps events.user_id → both MVs via columnToMVs', () => {
    const graph = buildDefault()
    const refs = graph.columnToMVs.get('analytics.events.user_id')
    expect(refs).toBeDefined()

    const mvNames = refs?.map((r) => r.mvName).sort()
    expect(mvNames).toEqual(['analytics.daily_stats_mv', 'analytics.user_funnels_mv'])
  })

  it('maps events.event_date → both MVs via columnToMVs', () => {
    const graph = buildDefault()
    const refs = graph.columnToMVs.get('analytics.events.event_date')
    expect(refs).toBeDefined()

    const mvNames = refs?.map((r) => r.mvName).sort()
    expect(mvNames).toEqual(['analytics.daily_stats_mv', 'analytics.user_funnels_mv'])
  })

  it('maps events.revenue → both MVs (sum/sumState)', () => {
    const graph = buildDefault()
    const refs = graph.columnToMVs.get('analytics.events.revenue')
    expect(refs).toBeDefined()

    const mvNames = refs?.map((r) => r.mvName).sort()
    expect(mvNames).toEqual(['analytics.daily_stats_mv', 'analytics.user_funnels_mv'])
  })

  it('records correct usageContext for column references', () => {
    const graph = buildDefault()
    const refs = graph.columnToMVs.get('analytics.events.event_type')
    expect(refs).toBeDefined()

    // event_type appears in SELECT and GROUP BY for daily_stats_mv
    const dailyRefs = refs?.filter((r) => r.mvName === 'analytics.daily_stats_mv')
    const contexts = dailyRefs?.map((r) => r.usageContext).sort()
    expect(contexts).toContain('select')
    expect(contexts).toContain('group_by')
  })
})

// ─── MergeTree Internal Dependencies ──────────────────────────────────

describe('MergeTree internal dependencies', () => {
  it('extracts orderByColumns for events', () => {
    const graph = buildDefault()
    expect(graph.orderByColumns.get('analytics.events')).toEqual([
      'event_date',
      'user_id',
      'event_type',
    ])
  })

  it('extracts orderByColumns for sessions', () => {
    const graph = buildDefault()
    expect(graph.orderByColumns.get('analytics.sessions')).toEqual(['session_date', 'user_id'])
  })

  it('extracts partitionByColumns for events', () => {
    const graph = buildDefault()
    expect(graph.partitionByColumns.get('analytics.events')).toEqual(['event_date'])
  })

  it('extracts ttlExprColumns for events', () => {
    const graph = buildDefault()
    expect(graph.ttlExprColumns.get('analytics.events')).toEqual(['event_date'])
  })

  it('extracts sampleByColumn for events', () => {
    const graph = buildDefault()
    expect(graph.sampleByColumn.get('analytics.events')).toBe('user_id')
  })

  it('does not have TTL for users table', () => {
    const graph = buildDefault()
    expect(graph.ttlExprColumns.has('analytics.users')).toBe(false)
  })

  it('does not have sampleBy for sessions table', () => {
    const graph = buildDefault()
    expect(graph.sampleByColumn.has('analytics.sessions')).toBe(false)
  })

  it('extracts orderByColumns for single-column ORDER BY (users)', () => {
    const graph = buildDefault()
    expect(graph.orderByColumns.get('analytics.users')).toEqual(['user_id'])
  })
})

// ─── Dictionary Sources ───────────────────────────────────────────────

describe('dictionary sources', () => {
  it('extracts dictSources for regions dictionary', () => {
    const graph = buildDefault()
    const dep = graph.dictSources.get('analytics.regions')
    expect(dep).toBeDefined()
    expect(dep?.sourceTable).toBe('analytics.regions_source')
    expect(dep?.keyColumns).toEqual(['region_id'])
  })
})

// ─── Index Columns ────────────────────────────────────────────────────

describe('index columns', () => {
  it('extracts column references from skip indices', () => {
    const indices: RawIndexRow[] = [
      {
        database: 'analytics',
        table: 'events',
        name: 'idx_event_type',
        expr: 'event_type',
        type: 'set(100)',
      },
      {
        database: 'analytics',
        table: 'events',
        name: 'idx_user_revenue',
        expr: 'user_id, revenue',
        type: 'minmax',
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

    expect(graph.indexColumns.get('analytics.events.idx_event_type')).toEqual(['event_type'])
    expect(graph.indexColumns.get('analytics.events.idx_user_revenue')).toEqual([
      'user_id',
      'revenue',
    ])
  })
})

// ─── Default Expression Dependencies ──────────────────────────────────

describe('default expression deps', () => {
  it('does not create entries for literal defaults', () => {
    // raw_events.processed has DEFAULT 0 — no column reference
    const graph = buildDefault()
    expect(graph.defaultExprDeps.has('analytics.raw_events.processed')).toBe(false)
  })

  it('does not create entries for function-only defaults', () => {
    // events.event_id has DEFAULT generateUUIDv4() — no column reference
    const graph = buildDefault()
    expect(graph.defaultExprDeps.has('analytics.events.event_id')).toBe(false)
  })

  it('extracts column references from default expressions', () => {
    const columnsWithDep: RawColumnRow[] = [
      ...rawColumns,
      {
        database: 'analytics',
        table: 'events',
        name: 'full_url',
        type: 'String',
        default_kind: 'MATERIALIZED',
        default_expression: "concat(page_url, '?ref=', referrer)",
        compression_codec: '',
        data_compressed_bytes: '0',
        data_uncompressed_bytes: '0',
      },
    ]

    const graph = buildDependencyGraph(
      rawTables,
      columnsWithDep,
      emptyIndices,
      rawDictionaries,
      emptyPolicies,
      emptyGrants,
    )

    expect(graph.defaultExprDeps.get('analytics.events.full_url')).toEqual(['page_url', 'referrer'])
  })
})

// ─── Column Grants ────────────────────────────────────────────────────

describe('column grants', () => {
  it('maps column grants to roles', () => {
    const grants: RawGrantRow[] = [
      {
        user_name: '',
        role_name: 'analyst_role',
        database: 'analytics',
        table: 'events',
        column: 'user_id',
        grant_option: 0,
      },
      {
        user_name: 'bob',
        role_name: '',
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

    const roles = graph.columnGrants.get('analytics.events.user_id')
    expect(roles).toEqual(['analyst_role', 'bob'])
  })
})

// ─── Row Policies ─────────────────────────────────────────────────────

describe('row policies', () => {
  it('extracts columns from select_filter', () => {
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

    const dep = graph.rowPolicies.get('analytics.events.country_filter')
    expect(dep).toBeDefined()
    expect(dep?.table).toBe('analytics.events')
    expect(dep?.columns).toEqual(['country'])
  })
})

// ─── Distributed & Buffer Tables ──────────────────────────────────────

describe('distributed and buffer tables', () => {
  it('parses Distributed engine to extract local table', () => {
    const tables: RawTableRow[] = [
      {
        database: 'analytics',
        name: 'events_distributed',
        engine: 'Distributed',
        total_rows: '0',
        total_bytes: '0',
        data_compressed_bytes: '0',
        create_table_query:
          "CREATE TABLE analytics.events_distributed ENGINE = Distributed('cluster1', 'analytics', 'events', rand())",
        sorting_key: '',
        partition_key: '',
        metadata_modification_time: '2026-03-15 00:00:00',
      },
    ]

    const graph = buildDependencyGraph(
      tables,
      rawColumns,
      emptyIndices,
      [],
      emptyPolicies,
      emptyGrants,
    )

    expect(graph.distributedTables.get('analytics.events_distributed')).toBe('analytics.events')
  })

  it('parses Buffer engine to extract destination table', () => {
    const tables: RawTableRow[] = [
      {
        database: 'analytics',
        name: 'events_buffer',
        engine: 'Buffer',
        total_rows: '0',
        total_bytes: '0',
        data_compressed_bytes: '0',
        create_table_query:
          "CREATE TABLE analytics.events_buffer ENGINE = Buffer('analytics', 'events', 16, 10, 100, 10000, 100000, 10000000, 100000000)",
        sorting_key: '',
        partition_key: '',
        metadata_modification_time: '2026-03-15 00:00:00',
      },
    ]

    const graph = buildDependencyGraph(
      tables,
      rawColumns,
      emptyIndices,
      [],
      emptyPolicies,
      emptyGrants,
    )

    expect(graph.bufferTables.get('analytics.events_buffer')).toBe('analytics.events')
  })
})

// ─── Edge Cases ───────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles empty input gracefully', () => {
    const graph = buildDependencyGraph([], [], [], [], [], [])
    expect(graph.mvSources.size).toBe(0)
    expect(graph.orderByColumns.size).toBe(0)
    expect(graph.columnToMVs.size).toBe(0)
  })

  it('does not create MV entries for non-MV tables', () => {
    const graph = buildDefault()
    expect(graph.mvSources.has('analytics.events')).toBe(false)
    expect(graph.mvTargets.has('analytics.events')).toBe(false)
  })
})

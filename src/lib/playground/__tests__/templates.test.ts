import { describe, expect, it } from 'vitest'
import type { RawColumnRow, RawTableRow } from '@/lib/clickhouse/types'
import { buildStarterQueries } from '../templates'

function table(overrides: Partial<RawTableRow>): RawTableRow {
  return {
    database: 'analytics',
    name: 'events',
    engine: 'MergeTree',
    total_rows: '1000',
    total_bytes: '1000',
    data_compressed_bytes: '1000',
    create_table_query: '',
    sorting_key: '',
    partition_key: '',
    metadata_modification_time: '',
    ...overrides,
  }
}

function column(overrides: Partial<RawColumnRow>): RawColumnRow {
  return {
    database: 'analytics',
    table: 'events',
    name: 'event_type',
    type: 'String',
    default_kind: '',
    default_expression: '',
    compression_codec: '',
    data_compressed_bytes: '0',
    data_uncompressed_bytes: '0',
    ...overrides,
  }
}

describe('buildStarterQueries', () => {
  it('falls back to SELECT 1 when schema is empty', () => {
    const queries = buildStarterQueries([], [])

    expect(queries).toEqual([
      {
        id: 'select-one',
        title: 'Connection smoke test',
        description: 'Verify that query execution works.',
        badge: 'Health',
        sql: 'SELECT 1',
      },
    ])
  })

  it('prefers the current database before larger tables elsewhere', () => {
    const queries = buildStarterQueries(
      [
        table({ database: 'analytics', name: 'events', total_rows: '1000' }),
        table({ database: 'warehouse', name: 'huge_events', total_rows: '100000' }),
      ],
      [column({ database: 'analytics', table: 'events', name: 'event_type', type: 'String' })],
      'analytics',
    )

    expect(queries[0]?.sql).toContain('FROM `analytics`.`events`')
  })

  it('builds browse, group, recent, and profile starters from table columns', () => {
    const queries = buildStarterQueries(
      [table({})],
      [
        column({ name: 'event_type', type: 'LowCardinality(String)' }),
        column({ name: 'event_date', type: 'Date' }),
        column({ name: 'revenue', type: 'Decimal(18, 2)' }),
      ],
      'analytics',
    )

    expect(queries.map((query) => query.id)).toEqual(['browse', 'group-by', 'recent', 'profile'])
    expect(queries[0]?.sql).toBe('SELECT *\nFROM `analytics`.`events`\nLIMIT 100')
    expect(queries[1]?.sql).toContain('GROUP BY `event_type`')
    expect(queries[2]?.sql).toContain('ORDER BY `event_date` DESC')
    expect(queries[3]?.sql).toContain('avg(`revenue`) AS avg_value')
  })

  it('escapes backticks in generated identifiers', () => {
    const queries = buildStarterQueries(
      [table({ database: 'ana`lytics', name: 'eve`nts' })],
      [column({ database: 'ana`lytics', table: 'eve`nts', name: 'event`type', type: 'String' })],
      'ana`lytics',
    )

    expect(queries[0]?.sql).toContain('FROM `ana``lytics`.`eve``nts`')
    expect(queries[1]?.sql).toContain('`event``type`')
  })
})

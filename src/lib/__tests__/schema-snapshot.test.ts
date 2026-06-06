import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RawColumnRow, RawTableRow } from '@/lib/clickhouse/types'
import {
  buildSchemaDiff,
  buildSchemaSnapshot,
  loadSchemaSnapshot,
  saveSchemaSnapshot,
} from '../schema-snapshot'

const table = (name: string, overrides: Partial<RawTableRow> = {}): RawTableRow => ({
  database: 'analytics',
  name,
  engine: 'MergeTree',
  total_rows: '10',
  total_bytes: '2048',
  data_compressed_bytes: '1024',
  create_table_query: 'CREATE TABLE analytics.secret ENGINE = S3(secret_access_key)',
  sorting_key: 'id',
  partition_key: 'toYYYYMM(date)',
  metadata_modification_time: '2026-01-01 00:00:00',
  ...overrides,
})

const column = (tableName: string, name: string, overrides: Partial<RawColumnRow> = {}) => ({
  database: 'analytics',
  table: tableName,
  name,
  type: 'UInt64',
  default_kind: '',
  default_expression: '',
  compression_codec: '',
  data_compressed_bytes: '0',
  data_uncompressed_bytes: '0',
  ...overrides,
})

function makeStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key)
    }),
  }
}

describe('schema snapshots', () => {
  let storage: ReturnType<typeof makeStorage>

  beforeEach(() => {
    storage = makeStorage()
    vi.stubGlobal('localStorage', storage)
  })

  it('builds a local snapshot without raw DDL or connection secrets', () => {
    const snapshot = buildSchemaSnapshot({
      tables: [table('events')],
      columns: [column('events', 'id')],
      createdAt: '2026-06-06T00:00:00.000Z',
    })

    const serialized = JSON.stringify(snapshot)

    expect(snapshot.tables[0]).toEqual({
      database: 'analytics',
      name: 'events',
      engine: 'MergeTree',
      sortingKey: 'id',
      partitionKey: 'toYYYYMM(date)',
    })
    expect(serialized).not.toContain('create_table_query')
    expect(serialized).not.toContain('secret_access_key')
    expect(serialized).not.toContain('password')
  })

  it('reports added, removed, and changed tables and columns', () => {
    const previous = buildSchemaSnapshot({
      tables: [table('events'), table('old_table')],
      columns: [
        column('events', 'id'),
        column('events', 'payload', { type: 'String' }),
        column('old_table', 'value'),
      ],
      createdAt: '2026-06-05T00:00:00.000Z',
    })
    const current = buildSchemaSnapshot({
      tables: [table('events', { engine: 'ReplacingMergeTree' }), table('new_table')],
      columns: [
        column('events', 'id', { type: 'UInt128' }),
        column('events', 'created_at'),
        column('new_table', 'value'),
      ],
      createdAt: '2026-06-06T00:00:00.000Z',
    })

    const diff = buildSchemaDiff(previous, current)

    expect(diff.addedTables.map((item) => item.name)).toEqual(['analytics.new_table'])
    expect(diff.removedTables.map((item) => item.name)).toEqual(['analytics.old_table'])
    expect(diff.changedTables).toEqual([
      {
        name: 'analytics.events',
        changes: [{ field: 'engine', before: 'MergeTree', after: 'ReplacingMergeTree' }],
      },
    ])
    expect(diff.addedColumns.map((item) => item.name)).toEqual([
      'analytics.events.created_at',
      'analytics.new_table.value',
    ])
    expect(diff.removedColumns.map((item) => item.name)).toEqual([
      'analytics.events.payload',
      'analytics.old_table.value',
    ])
    expect(diff.changedColumns).toEqual([
      {
        name: 'analytics.events.id',
        changes: [{ field: 'type', before: 'UInt64', after: 'UInt128' }],
      },
    ])
  })

  it('persists and loads the sanitized snapshot from localStorage', () => {
    const snapshot = buildSchemaSnapshot({
      tables: [table('events')],
      columns: [column('events', 'id')],
      createdAt: '2026-06-06T00:00:00.000Z',
    })

    saveSchemaSnapshot(snapshot)

    expect(loadSchemaSnapshot()).toEqual(snapshot)
    expect(storage.setItem).toHaveBeenCalledWith(
      'chtopo_schema_snapshot_v1',
      JSON.stringify(snapshot),
    )
  })
})

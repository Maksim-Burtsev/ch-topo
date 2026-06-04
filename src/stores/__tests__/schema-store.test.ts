import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchServerSchema } from '@/lib/api/schema'
import {
  fetchColumns,
  fetchDictionaries,
  fetchGrants,
  fetchIndices,
  fetchRowPolicies,
  fetchTables,
} from '@/lib/clickhouse/queries'
import type { ConnectionParams, RawColumnRow, RawTableRow } from '@/lib/clickhouse/types'
import { useSchemaStore } from '../schema-store'

vi.mock('@/lib/api/schema', () => ({
  fetchServerSchema: vi.fn(),
}))

vi.mock('@/lib/clickhouse/queries', () => ({
  fetchTables: vi.fn(),
  fetchColumns: vi.fn(),
  fetchIndices: vi.fn(),
  fetchDictionaries: vi.fn(),
  fetchRowPolicies: vi.fn(),
  fetchGrants: vi.fn(),
}))

const params: ConnectionParams = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: '',
}

const tableRow: RawTableRow = {
  database: 'analytics',
  name: 'events',
  engine: 'MergeTree',
  total_rows: '10',
  total_bytes: '1000',
  data_compressed_bytes: '500',
  create_table_query: 'CREATE TABLE analytics.events',
  sorting_key: 'event_id',
  partition_key: '',
  metadata_modification_time: '2026-01-01 00:00:00',
}

const columnRow: RawColumnRow = {
  database: 'analytics',
  table: 'events',
  name: 'event_id',
  type: 'UUID',
  default_kind: '',
  default_expression: '',
  compression_codec: '',
  data_compressed_bytes: '100',
  data_uncompressed_bytes: '200',
}

function resetSchemaStore() {
  useSchemaStore.setState({
    status: 'idle',
    error: null,
    tables: [],
    columns: [],
    indices: [],
    dictionaries: [],
    rowPolicies: [],
    grants: [],
    warnings: [],
    tablesReady: false,
    columnsReady: false,
  })
}

describe('useSchemaStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetSchemaStore()
  })

  it('keeps schema ready when optional collections fail with permission errors', async () => {
    vi.mocked(fetchTables).mockResolvedValue([tableRow])
    vi.mocked(fetchColumns).mockResolvedValue([columnRow])
    vi.mocked(fetchIndices).mockRejectedValue(new Error('indices denied'))
    vi.mocked(fetchDictionaries).mockResolvedValue([])
    vi.mocked(fetchRowPolicies).mockRejectedValue(new Error('row policies denied'))
    vi.mocked(fetchGrants).mockResolvedValue([])

    await useSchemaStore.getState().loadSchema(params)

    expect(useSchemaStore.getState()).toMatchObject({
      status: 'ready',
      error: null,
      tablesReady: true,
      columnsReady: true,
      indices: [],
      rowPolicies: [],
      warnings: [
        { source: 'indices', message: 'indices denied' },
        { source: 'rowPolicies', message: 'row policies denied' },
      ],
    })
  })

  it('loads Server Mode schema through the backend API without direct ClickHouse queries', async () => {
    vi.mocked(fetchServerSchema).mockResolvedValue({
      tables: [tableRow],
      columns: [columnRow],
      indices: [],
      dictionaries: [],
      rowPolicies: [],
      grants: [],
      warnings: [{ source: 'grants', message: 'grants denied' }],
    })

    await useSchemaStore.getState().loadSchema(params, { mode: 'server' })

    expect(fetchServerSchema).toHaveBeenCalledOnce()
    expect(fetchTables).not.toHaveBeenCalled()
    expect(fetchColumns).not.toHaveBeenCalled()
    expect(useSchemaStore.getState()).toMatchObject({
      status: 'ready',
      tablesReady: true,
      columnsReady: true,
      tables: [{ database: 'analytics', name: 'events' }],
      warnings: [{ source: 'grants', message: 'grants denied' }],
    })
  })

  it('treats tables and columns as critical collections', async () => {
    vi.mocked(fetchTables).mockResolvedValue([])
    vi.mocked(fetchColumns).mockRejectedValue(new Error('columns denied'))
    vi.mocked(fetchIndices).mockResolvedValue([])
    vi.mocked(fetchDictionaries).mockResolvedValue([])
    vi.mocked(fetchRowPolicies).mockResolvedValue([])
    vi.mocked(fetchGrants).mockResolvedValue([])

    await useSchemaStore.getState().loadSchema(params)

    expect(useSchemaStore.getState()).toMatchObject({
      status: 'error',
      error: 'columns denied',
      warnings: [],
      columnsReady: false,
    })
  })
})

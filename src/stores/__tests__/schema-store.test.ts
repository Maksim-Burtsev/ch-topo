import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchColumns,
  fetchDictionaries,
  fetchGrants,
  fetchIndices,
  fetchRowPolicies,
  fetchTables,
} from '@/lib/clickhouse/queries'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import { useSchemaStore } from '../schema-store'

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
    vi.mocked(fetchTables).mockResolvedValue([{ database: 'analytics', name: 'events' }] as Awaited<
      ReturnType<typeof fetchTables>
    >)
    vi.mocked(fetchColumns).mockResolvedValue([
      { database: 'analytics', table: 'events', name: 'event_id' },
    ] as Awaited<ReturnType<typeof fetchColumns>>)
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

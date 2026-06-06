import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchServerHistory } from '@/lib/api/history'
import { fetchDDLHistory } from '@/lib/clickhouse/queries'
import type { ConnectionParams, RawDDLHistoryRow } from '@/lib/clickhouse/types'
import type { ConnectionMode } from '../connection-store'
import { useHistoryStore } from '../history-store'

vi.mock('@/lib/api/history', () => ({
  fetchServerHistory: vi.fn(),
}))

vi.mock('@/lib/clickhouse/queries', () => ({
  fetchDDLHistory: vi.fn(),
}))

const params: ConnectionParams = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: '',
}

const historyRow: RawDDLHistoryRow = {
  event_time: '2026-01-01 00:00:00',
  query: 'CREATE TABLE analytics.events',
  type: 'QueryFinish',
  exception: '',
  query_duration_ms: '12',
  user: 'readonly',
  initial_user: 'readonly',
  query_kind: 'Create',
  current_database: 'analytics',
}

function resetHistoryStore() {
  useHistoryStore.setState({
    entries: [],
    status: 'idle',
    error: null,
  })
}

describe('useHistoryStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetHistoryStore()
  })

  it('keeps Direct Mode history loading through ClickHouse', async () => {
    vi.mocked(fetchDDLHistory).mockResolvedValue([historyRow])

    await useHistoryStore.getState().loadHistory(params, { mode: 'direct' })

    expect(fetchDDLHistory).toHaveBeenCalledWith(params)
    expect(fetchServerHistory).not.toHaveBeenCalled()
    expect(useHistoryStore.getState()).toMatchObject({
      status: 'ready',
      entries: [historyRow],
    })
  })

  it('loads Server Mode history through the backend API', async () => {
    vi.mocked(fetchServerHistory).mockResolvedValue([historyRow])

    await useHistoryStore.getState().loadHistory(params, { mode: 'server' })

    expect(fetchServerHistory).toHaveBeenCalledOnce()
    expect(fetchDDLHistory).not.toHaveBeenCalled()
    expect(useHistoryStore.getState()).toMatchObject({
      status: 'ready',
      entries: [historyRow],
    })
  })

  it('loads bundled Demo Mode history without ClickHouse or backend API calls', async () => {
    await useHistoryStore.getState().loadHistory(params, { mode: 'demo' as ConnectionMode })

    expect(fetchServerHistory).not.toHaveBeenCalled()
    expect(fetchDDLHistory).not.toHaveBeenCalled()
    expect(useHistoryStore.getState().status).toBe('ready')
    expect(useHistoryStore.getState().entries.length).toBeGreaterThan(0)
  })
})

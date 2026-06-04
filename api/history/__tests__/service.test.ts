import { describe, expect, it } from 'vitest'
import type { BackendClickHouseConnection } from '../../clickhouse/types.js'
import { loadHistory } from '../service.js'
import type { HistoryQueryRequest, HistoryQueryRows } from '../types.js'

const connection: BackendClickHouseConnection = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: 'secret',
}

describe('history service', () => {
  it('loads DDL history from system.query_log', async () => {
    const calls: HistoryQueryRequest[] = []
    const queryRows: HistoryQueryRows = <T>(request: HistoryQueryRequest) => {
      calls.push(request)
      return Promise.resolve([
        {
          event_time: '2026-01-01 00:00:00',
          query: 'CREATE TABLE analytics.events',
          type: 'QueryFinish',
          query_kind: 'Create',
          current_database: 'analytics',
        },
      ] as T[])
    }

    await expect(loadHistory(connection, queryRows)).resolves.toEqual([
      {
        event_time: '2026-01-01 00:00:00',
        query: 'CREATE TABLE analytics.events',
        type: 'QueryFinish',
        query_kind: 'Create',
        current_database: 'analytics',
      },
    ])
    expect(calls[0]?.sql).toContain('FROM system.query_log')
  })

  it('normalizes missing system.query_log permissions', async () => {
    const queryRows: HistoryQueryRows = () =>
      Promise.reject(new Error('ACCESS_DENIED: Not enough privileges for system.query_log'))

    await expect(loadHistory(connection, queryRows)).rejects.toMatchObject({
      name: 'HistoryLoadError',
      statusCode: 403,
      message: 'DDL history requires SELECT permission on system.query_log.',
    })
  })

  it('normalizes disabled or missing system.query_log', async () => {
    const queryRows: HistoryQueryRows = () =>
      Promise.reject(new Error('Table system.query_log does not exist'))

    await expect(loadHistory(connection, queryRows)).rejects.toMatchObject({
      name: 'HistoryLoadError',
      statusCode: 424,
      message: 'ClickHouse system.query_log is not enabled or has no table yet.',
    })
  })
})

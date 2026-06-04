import { describe, expect, it, vi } from 'vitest'
import type { BackendClickHouseConnection } from '../../clickhouse/types.js'
import { loadSchema } from '../service.js'
import type { SchemaQueryRequest, SchemaQueryRows } from '../types.js'

const connection: BackendClickHouseConnection = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: 'secret',
}

describe('schema service', () => {
  it('loads all schema collections and returns the frontend-compatible payload shape', async () => {
    const calls: SchemaQueryRequest[] = []
    const queryRows: SchemaQueryRows = <T>(request: SchemaQueryRequest) => {
      calls.push(request)
      const { sql } = request
      let rows: unknown[]

      if (sql.includes('FROM system.tables')) {
        rows = [{ database: 'analytics', name: 'events', engine: 'MergeTree' }]
      } else if (sql.includes('FROM system.columns')) {
        rows = [{ database: 'analytics', table: 'events', name: 'event_id', type: 'UUID' }]
      } else if (sql.includes('FROM system.data_skipping_indices')) {
        rows = [{ database: 'analytics', table: 'events', name: 'idx_event_type' }]
      } else if (sql.includes('FROM system.dictionaries')) {
        rows = [{ database: 'analytics', name: 'geo_dict' }]
      } else if (sql.includes('FROM system.row_policies')) {
        rows = [{ database: 'analytics', table: 'events', name: 'tenant_filter' }]
      } else if (sql.includes('FROM system.grants')) {
        rows = [{ user_name: 'readonly', database: 'analytics', table: 'events' }]
      } else {
        rows = []
      }

      return Promise.resolve(rows as T[])
    }
    const queryRowsSpy = vi.fn(queryRows)

    const payload = await loadSchema(connection, queryRowsSpy)

    expect(payload).toEqual({
      tables: [{ database: 'analytics', name: 'events', engine: 'MergeTree' }],
      columns: [{ database: 'analytics', table: 'events', name: 'event_id', type: 'UUID' }],
      indices: [{ database: 'analytics', table: 'events', name: 'idx_event_type' }],
      dictionaries: [{ database: 'analytics', name: 'geo_dict' }],
      rowPolicies: [{ database: 'analytics', table: 'events', name: 'tenant_filter' }],
      grants: [{ user_name: 'readonly', database: 'analytics', table: 'events' }],
      warnings: [],
    })
    expect(queryRowsSpy).toHaveBeenCalledTimes(6)
    expect(
      calls.some(
        (request) =>
          request.connection === connection && request.sql.includes('FROM system.tables'),
      ),
    ).toBe(true)
  })

  it('returns warnings and empty rows when optional collections fail', async () => {
    const queryRows: SchemaQueryRows = <T>({ sql }: SchemaQueryRequest) => {
      if (sql.includes('FROM system.tables')) {
        return Promise.resolve([{ database: 'analytics', name: 'events' }] as T[])
      }
      if (sql.includes('FROM system.columns')) {
        return Promise.resolve([
          { database: 'analytics', table: 'events', name: 'event_id' },
        ] as T[])
      }
      if (sql.includes('FROM system.data_skipping_indices')) {
        return Promise.reject(new Error('indices denied'))
      }
      if (sql.includes('FROM system.row_policies')) {
        return Promise.reject(new Error('row policies denied'))
      }
      return Promise.resolve([])
    }

    await expect(loadSchema(connection, queryRows)).resolves.toMatchObject({
      tables: [{ database: 'analytics', name: 'events' }],
      columns: [{ database: 'analytics', table: 'events', name: 'event_id' }],
      indices: [],
      rowPolicies: [],
      warnings: [
        { source: 'indices', message: 'indices denied' },
        { source: 'rowPolicies', message: 'row policies denied' },
      ],
    })
  })

  it('fails when critical tables or columns cannot be loaded', async () => {
    const queryRows: SchemaQueryRows = <T>({ sql }: SchemaQueryRequest) => {
      if (sql.includes('FROM system.tables')) {
        return Promise.resolve([] as T[])
      }
      if (sql.includes('FROM system.columns')) {
        return Promise.reject(new Error('columns denied'))
      }
      return Promise.resolve([] as T[])
    }

    await expect(loadSchema(connection, queryRows)).rejects.toThrow('columns denied')
  })
})

import { describe, expect, it, vi } from 'vitest'
import { BackendClickHouseError } from '../../clickhouse/client.js'
import type { BackendClickHouseConnection } from '../../clickhouse/types.js'
import { executeQuery, QueryExecutionError } from '../service.js'
import type { ClickHouseExecute } from '../types.js'

const connection: BackendClickHouseConnection = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: 'secret',
}

describe('query service', () => {
  it('executes FORMAT JSON queries with timeout and result limits', async () => {
    const execute = vi.fn<ClickHouseExecute>().mockResolvedValue({
      ok: true,
      status: 200,
      body: JSON.stringify({
        meta: [{ name: 'id', type: 'UInt64' }],
        data: [{ id: 1 }],
        rows: 1,
        statistics: { elapsed: 0.05, rows_read: 10, bytes_read: 200 },
      }),
    })

    await expect(
      executeQuery(
        connection,
        {
          sql: 'SELECT id FROM events;',
          timeoutMs: 1_000,
          maxRows: 100,
          maxBytes: 4096,
        },
        execute,
      ),
    ).resolves.toEqual({
      columns: [{ name: 'id', type: 'UInt64' }],
      rows: [{ id: 1 }],
      elapsed: 0.05,
      rowsRead: 10,
      bytesRead: 200,
    })
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      connection,
      format: 'JSON',
      timeoutMs: 1_000,
    })
    expect(execute.mock.calls[0]?.[0].sql).toContain('max_result_rows = 100')
    expect(execute.mock.calls[0]?.[0].sql).toContain('max_result_bytes = 4096')
    expect(execute.mock.calls[0]?.[0].sql).not.toContain('; SETTINGS')
  })

  it('normalizes ClickHouse errors into a consistent query error shape', async () => {
    const execute: ClickHouseExecute = () =>
      Promise.reject(
        new BackendClickHouseError(
          'Code: 62. DB::Exception: Syntax error (line 2, col 1): FORM events',
          400,
          '62',
        ),
      )

    await expect(
      executeQuery(connection, { sql: 'SELECT *\nFORM events' }, execute),
    ).rejects.toEqual(
      new QueryExecutionError({
        message: 'Code: 62. DB::Exception: Syntax error (line 2, col 1): FORM events',
        statusCode: 400,
        code: '62',
        errorLine: 2,
      }),
    )
  })
})

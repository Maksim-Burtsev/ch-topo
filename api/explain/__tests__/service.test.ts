import { describe, expect, it, vi } from 'vitest'
import { BackendClickHouseError } from '../../clickhouse/client.js'
import type { BackendClickHouseConnection } from '../../clickhouse/types.js'
import { QueryExecutionError } from '../../query/service.js'
import type { ClickHouseExecute } from '../../query/types.js'
import { explainQuery } from '../service.js'
import type { ExplainMode } from '../types.js'

const connection: BackendClickHouseConnection = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: 'secret',
}

describe('explain service', () => {
  it.each([
    ['plan', 'EXPLAIN PLAN SELECT 1'],
    ['pipeline', 'EXPLAIN PIPELINE SELECT 1'],
    ['syntax', 'EXPLAIN SYNTAX SELECT 1'],
  ] satisfies Array<[ExplainMode, string]>)(
    'executes %s explain with timeout',
    async (mode, expectedSql) => {
      const execute = vi.fn<ClickHouseExecute>().mockResolvedValue({
        ok: true,
        status: 200,
        body: 'ReadFromMergeTree',
      })

      await expect(
        explainQuery(connection, { sql: ' SELECT 1; ', mode, timeoutMs: 1_000 }, execute),
      ).resolves.toEqual({
        mode,
        text: 'ReadFromMergeTree',
      })
      expect(execute).toHaveBeenCalledWith(
        expect.objectContaining({
          connection,
          sql: expectedSql,
          timeoutMs: 1_000,
        }),
      )
    },
  )

  it('uses the shared query error shape', async () => {
    const execute: ClickHouseExecute = () =>
      Promise.reject(
        new BackendClickHouseError(
          'Code: 62. DB::Exception: Syntax error (line 3, col 1): FORM events',
          400,
          '62',
        ),
      )

    await expect(
      explainQuery(connection, { sql: 'SELECT *\nFORM events' }, execute),
    ).rejects.toEqual(
      new QueryExecutionError({
        message: 'Code: 62. DB::Exception: Syntax error (line 3, col 1): FORM events',
        statusCode: 400,
        code: '62',
        errorLine: 3,
      }),
    )
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { query } from '../client'
import { resetClickHouseTransport, setClickHouseTransport } from '../transport'
import type { ClickHouseTransport } from '../transport'
import type { ConnectionParams } from '../types'

const params: ConnectionParams = {
  host: 'localhost',
  port: 8123,
  database: 'default',
  user: 'default',
  password: '',
}

describe('ClickHouse transport', () => {
  afterEach(() => {
    resetClickHouseTransport()
  })

  it('routes query calls through the configured transport', async () => {
    const transport: ClickHouseTransport = {
      execute: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: '{"value":1}\n',
      }),
    }

    setClickHouseTransport(transport)

    await expect(query<{ value: number }>(params, 'SELECT 1 AS value')).resolves.toEqual([
      { value: 1 },
    ])
    expect(transport.execute).toHaveBeenCalledWith({
      params,
      sql: 'SELECT 1 AS value',
      format: 'JSONEachRow',
    })
  })
})

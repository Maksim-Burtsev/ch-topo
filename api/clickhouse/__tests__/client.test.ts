import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BackendClickHouseError, executeClickHouseRequest, queryClickHouseRows } from '../client.js'
import type { BackendClickHouseConnection } from '../types.js'

const connection: BackendClickHouseConnection = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: 'secret',
}

describe('backend ClickHouse client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sends SQL with connection headers and parses a successful response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"name":"events"}\n{"name":"users"}\n', { status: 200 }),
    )

    const response = await executeClickHouseRequest({
      connection,
      sql: 'SELECT name FROM system.tables',
      format: 'JSONEachRow',
    })

    expect(response).toEqual({
      ok: true,
      status: 200,
      body: '{"name":"events"}\n{"name":"users"}\n',
    })
    expect(fetch).toHaveBeenCalledWith(
      'http://clickhouse.local:8123/',
      expect.objectContaining({
        method: 'POST',
        body: 'SELECT name FROM system.tables FORMAT JSONEachRow',
        headers: expect.objectContaining({
          'X-ClickHouse-Database': 'analytics',
          'X-ClickHouse-User': 'readonly',
          'X-ClickHouse-Key': 'secret',
        }) as Record<string, string>,
      }),
    )
  })

  it('omits the password header when password is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('', { status: 200 }))

    await executeClickHouseRequest({
      connection: { ...connection, password: '' },
      sql: 'SELECT 1',
    })

    const init = vi.mocked(fetch).mock.calls[0]?.[1]
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.['X-ClickHouse-Key']).toBeUndefined()
  })

  it('parses JSONEachRow rows through the typed helper', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"id":1}\n{"id":2}\n', { status: 200 }))

    await expect(
      queryClickHouseRows<{ id: number }>({
        connection,
        sql: 'SELECT id FROM events',
      }),
    ).resolves.toEqual([{ id: 1 }, { id: 2 }])
  })

  it('normalizes ClickHouse HTTP errors', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('Code: 60. DB::Exception: Table missing', { status: 404 }),
    )

    await expect(
      executeClickHouseRequest({
        connection,
        sql: 'SELECT * FROM missing',
      }),
    ).rejects.toMatchObject({
      name: 'BackendClickHouseError',
      message: 'Code: 60. DB::Exception: Table missing',
      statusCode: 404,
      code: '60',
    })
  })

  it('normalizes network failures', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('fetch failed'))

    await expect(
      executeClickHouseRequest({
        connection,
        sql: 'SELECT 1',
      }),
    ).rejects.toThrow('Network error: Cannot reach clickhouse.local:8123')
  })

  it('normalizes request timeouts', async () => {
    vi.useFakeTimers()

    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'))
          })
        }),
    )

    const promise = executeClickHouseRequest({
      connection,
      sql: 'SELECT sleep(60)',
      timeoutMs: 1000,
    })
    const expectation = expect(promise).rejects.toMatchObject({
      name: 'BackendClickHouseError',
      message: 'ClickHouse query timed out after 1000ms',
      statusCode: 0,
    })

    await vi.advanceTimersByTimeAsync(1001)
    await expectation
  })

  it('preserves caller-initiated aborts as cancellations', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      executeClickHouseRequest({
        connection,
        sql: 'SELECT 1',
        signal: controller.signal,
      }),
    ).rejects.toEqual(new BackendClickHouseError('ClickHouse query cancelled', 0))
  })
})

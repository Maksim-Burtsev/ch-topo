import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import {
  executeQuery,
  parseErrorLine,
  parseSummaryHeader,
} from '../execute'

// ── Test fixtures ──────────────────────────────────────────────

const params: ConnectionParams = {
  host: 'localhost',
  port: 8123,
  database: 'default',
  user: 'default',
  password: '',
}

function jsonResponse(
  meta: { name: string; type: string }[],
  data: Record<string, unknown>[],
  stats = { elapsed: 0.05, rows_read: 100, bytes_read: 5000 },
) {
  return JSON.stringify({ meta, data, rows: data.length, statistics: stats })
}

// ── Unit tests: parseErrorLine ─────────────────────────────────

describe('parseErrorLine', () => {
  it('extracts line number from ClickHouse error', () => {
    const msg =
      "Code: 62. DB::Exception: Syntax error: failed at position 10 ('FORM') (line 1, col 10): FORM events"
    expect(parseErrorLine(msg)).toBe(1)
  })

  it('extracts multi-digit line number', () => {
    const msg =
      "Code: 62. DB::Exception: Syntax error (line 42, col 5): something"
    expect(parseErrorLine(msg)).toBe(42)
  })

  it('returns undefined when no line number present', () => {
    expect(parseErrorLine('Some generic error')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(parseErrorLine('')).toBeUndefined()
  })
})

// ── Unit tests: parseSummaryHeader ─────────────────────────────

describe('parseSummaryHeader', () => {
  it('parses valid JSON summary', () => {
    const result = parseSummaryHeader(
      '{"read_rows":50,"read_bytes":2048,"elapsed_ns":100000}',
    )
    expect(result).toEqual({
      read_rows: 50,
      read_bytes: 2048,
      elapsed_ns: 100000,
    })
  })

  it('returns undefined for null', () => {
    expect(parseSummaryHeader(null)).toBeUndefined()
  })

  it('returns undefined for invalid JSON', () => {
    expect(parseSummaryHeader('not json')).toBeUndefined()
  })
})

// ── Integration-style tests: executeQuery ──────────────────────

describe('executeQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns columns, rows, and stats on success', async () => {
    const meta = [
      { name: 'id', type: 'UInt64' },
      { name: 'name', type: 'String' },
    ]
    const data = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]

    vi.mocked(fetch).mockResolvedValue(
      new Response(jsonResponse(meta, data), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await executeQuery('SELECT id, name FROM users', params)

    expect(result.error).toBeUndefined()
    expect(result.columns).toEqual(meta)
    expect(result.rows).toEqual(data)
    expect(result.elapsed).toBe(0.05)
    expect(result.rowsRead).toBe(100)
    expect(result.bytesRead).toBe(5000)
  })

  it('sends correct headers and body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(jsonResponse([], []), { status: 200 }),
    )

    const paramsWithPw: ConnectionParams = {
      ...params,
      password: 'secret',
    }

    await executeQuery('SELECT 1', paramsWithPw)

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8123/',
      expect.objectContaining({
        method: 'POST',
        body: 'SELECT 1 FORMAT JSON',
        headers: expect.objectContaining({
          'X-ClickHouse-User': 'default',
          'X-ClickHouse-Database': 'default',
          'X-ClickHouse-Key': 'secret',
        }) as Record<string, string>,
      }),
    )
  })

  it('does not send password header when password is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(jsonResponse([], []), { status: 200 }),
    )

    await executeQuery('SELECT 1', params)

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const init = callArgs?.[1]
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.['X-ClickHouse-Key']).toBeUndefined()
  })

  it('returns error result on HTTP error', async () => {
    const errorMsg =
      "Code: 62. DB::Exception: Syntax error: failed at position 8 ('FORM') (line 1, col 8): FORM events"

    vi.mocked(fetch).mockResolvedValue(
      new Response(errorMsg, { status: 400 }),
    )

    const result = await executeQuery('SELECT * FORM events', params)

    expect(result.error).toBe(errorMsg)
    expect(result.errorLine).toBe(1)
    expect(result.columns).toEqual([])
    expect(result.rows).toEqual([])
  })

  it('returns error result on network failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await executeQuery('SELECT 1', params)

    expect(result.error).toContain('Network error')
    expect(result.error).toContain('localhost:8123')
    expect(result.columns).toEqual([])
  })

  it('returns cancellation error when aborted', async () => {
    const controller = new AbortController()

    vi.mocked(fetch).mockImplementation(() => {
      controller.abort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    })

    const result = await executeQuery('SELECT 1', params, {
      signal: controller.signal,
    })

    expect(result.error).toBe('Query cancelled')
  })

  it('returns timeout error when query exceeds timeout', async () => {
    vi.useFakeTimers()

    vi.mocked(fetch).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal
          if (signal) {
            signal.addEventListener('abort', () => {
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            })
          }
        }),
    )

    const promise = executeQuery('SELECT sleep(60)', params, {
      timeoutMs: 1000,
    })

    await vi.advanceTimersByTimeAsync(1001)
    const result = await promise

    expect(result.error).toContain('timed out')
    expect(result.error).toContain('1000ms')

    vi.useRealTimers()
  })

  it('handles pre-aborted signal', async () => {
    const controller = new AbortController()
    controller.abort()

    vi.mocked(fetch).mockImplementation((_url, init) => {
      const signal = init?.signal
      if (signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      return Promise.resolve(new Response('', { status: 200 }))
    })

    const result = await executeQuery('SELECT 1', params, {
      signal: controller.signal,
    })

    expect(result.error).toBe('Query cancelled')
  })

  it('parses summary header when stats are missing from body', async () => {
    const meta = [{ name: 'n', type: 'UInt64' }]
    const data = [{ n: 1 }]
    const body = JSON.stringify({
      meta,
      data,
      rows: 1,
      statistics: { elapsed: 0.01, rows_read: 10, bytes_read: 200 },
    })

    vi.mocked(fetch).mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: {
          'X-ClickHouse-Summary':
            '{"read_rows":10,"read_bytes":200}',
        },
      }),
    )

    const result = await executeQuery('SELECT 1 as n', params)
    expect(result.rowsRead).toBe(10)
    expect(result.bytesRead).toBe(200)
  })

  it('returns empty error string for HTTP error with empty body', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('', { status: 500 }),
    )

    const result = await executeQuery('SELECT 1', params)
    expect(result.error).toBe('HTTP 500')
  })
})

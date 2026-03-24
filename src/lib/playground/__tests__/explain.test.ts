import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import { buildExplainQuery, explainQuery } from '../explain'

// ── Test fixtures ──────────────────────────────────────────────

const params: ConnectionParams = {
  host: 'localhost',
  port: 8123,
  database: 'default',
  user: 'default',
  password: '',
}

// ── Unit tests: buildExplainQuery ──────────────────────────────

describe('buildExplainQuery', () => {
  it('prepends EXPLAIN PLAN for plan mode', () => {
    expect(buildExplainQuery('SELECT 1', 'plan')).toBe(
      'EXPLAIN PLAN SELECT 1',
    )
  })

  it('prepends EXPLAIN PIPELINE for pipeline mode', () => {
    expect(buildExplainQuery('SELECT 1', 'pipeline')).toBe(
      'EXPLAIN PIPELINE SELECT 1',
    )
  })

  it('prepends EXPLAIN SYNTAX for syntax mode', () => {
    expect(buildExplainQuery('SELECT 1', 'syntax')).toBe(
      'EXPLAIN SYNTAX SELECT 1',
    )
  })

  it('trims whitespace from input', () => {
    expect(buildExplainQuery('  SELECT 1  ', 'plan')).toBe(
      'EXPLAIN PLAN SELECT 1',
    )
  })

  it('strips trailing semicolons', () => {
    expect(buildExplainQuery('SELECT 1;', 'plan')).toBe(
      'EXPLAIN PLAN SELECT 1',
    )
  })

  it('strips multiple trailing semicolons with whitespace', () => {
    expect(buildExplainQuery('SELECT 1 ;; ', 'plan')).toBe(
      'EXPLAIN PLAN SELECT 1',
    )
  })

  it('handles multiline queries', () => {
    const sql = 'SELECT *\nFROM events\nWHERE id = 1'
    expect(buildExplainQuery(sql, 'pipeline')).toBe(
      `EXPLAIN PIPELINE ${sql}`,
    )
  })
})

// ── Integration-style tests: explainQuery ──────────────────────

describe('explainQuery', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns explain text on success', async () => {
    const explainOutput =
      'Expression ((Projection + Before ORDER BY))\n  ReadFromMergeTree (default.events)'

    vi.mocked(fetch).mockResolvedValue(
      new Response(explainOutput, { status: 200 }),
    )

    const result = await explainQuery('SELECT * FROM events', params, 'plan')

    expect(result.error).toBeUndefined()
    expect(result.mode).toBe('plan')
    expect(result.text).toBe(explainOutput)
  })

  it('sends correct EXPLAIN PLAN query', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('plan output', { status: 200 }),
    )

    await explainQuery('SELECT 1', params, 'plan')

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8123/',
      expect.objectContaining({
        method: 'POST',
        body: 'EXPLAIN PLAN SELECT 1',
      }),
    )
  })

  it('sends correct EXPLAIN PIPELINE query', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('pipeline output', { status: 200 }),
    )

    await explainQuery('SELECT 1', params, 'pipeline')

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8123/',
      expect.objectContaining({
        body: 'EXPLAIN PIPELINE SELECT 1',
      }),
    )
  })

  it('sends correct EXPLAIN SYNTAX query', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('syntax output', { status: 200 }),
    )

    await explainQuery('SELECT 1', params, 'syntax')

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8123/',
      expect.objectContaining({
        body: 'EXPLAIN SYNTAX SELECT 1',
      }),
    )
  })

  it('defaults to plan mode', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('plan output', { status: 200 }),
    )

    const result = await explainQuery('SELECT 1', params)

    expect(result.mode).toBe('plan')
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8123/',
      expect.objectContaining({
        body: 'EXPLAIN PLAN SELECT 1',
      }),
    )
  })

  it('sends auth headers', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('ok', { status: 200 }),
    )

    const paramsWithPw: ConnectionParams = {
      ...params,
      password: 'secret',
    }

    await explainQuery('SELECT 1', paramsWithPw, 'plan')

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:8123/',
      expect.objectContaining({
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
      new Response('ok', { status: 200 }),
    )

    await explainQuery('SELECT 1', params, 'plan')

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const init = callArgs?.[1]
    const headers = init?.headers as Record<string, string> | undefined
    expect(headers?.['X-ClickHouse-Key']).toBeUndefined()
  })

  it('returns error on HTTP error', async () => {
    const errorMsg =
      "Code: 62. DB::Exception: Syntax error: failed at position 8 ('FORM')"

    vi.mocked(fetch).mockResolvedValue(
      new Response(errorMsg, { status: 400 }),
    )

    const result = await explainQuery('SELECT * FORM events', params, 'plan')

    expect(result.error).toBe(errorMsg)
    expect(result.text).toBe('')
    expect(result.mode).toBe('plan')
  })

  it('returns HTTP status when error body is empty', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('', { status: 500 }),
    )

    const result = await explainQuery('SELECT 1', params, 'plan')
    expect(result.error).toBe('HTTP 500')
  })

  it('returns network error on fetch failure', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await explainQuery('SELECT 1', params, 'plan')

    expect(result.error).toContain('Network error')
    expect(result.error).toContain('localhost:8123')
  })

  it('returns cancellation error when aborted', async () => {
    const controller = new AbortController()

    vi.mocked(fetch).mockImplementation(() => {
      controller.abort()
      throw new DOMException('The operation was aborted.', 'AbortError')
    })

    const result = await explainQuery('SELECT 1', params, 'plan', {
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

    const promise = explainQuery('SELECT sleep(60)', params, 'plan', {
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

    const result = await explainQuery('SELECT 1', params, 'plan', {
      signal: controller.signal,
    })

    expect(result.error).toBe('Query cancelled')
  })

  it('does not append FORMAT JSON to explain queries', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('output', { status: 200 }),
    )

    await explainQuery('SELECT 1', params, 'plan')

    const callArgs = vi.mocked(fetch).mock.calls[0]
    const init = callArgs?.[1]
    expect(init?.body).not.toContain('FORMAT JSON')
  })
})

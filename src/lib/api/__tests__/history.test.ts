import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchServerHistory } from '../history'

describe('Server Mode history API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads DDL history through /api/history with same-origin credentials', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          entries: [{ event_time: '2026-01-01 00:00:00', query: 'CREATE TABLE x' }],
        }),
        { status: 200 },
      ),
    )

    await expect(fetchServerHistory()).resolves.toEqual([
      { event_time: '2026-01-01 00:00:00', query: 'CREATE TABLE x' },
    ])
    expect(fetch).toHaveBeenCalledWith(
      '/api/history',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    )
  })

  it('normalizes history API failures', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"error":"DDL history requires SELECT permission on system.query_log."}', {
        status: 403,
      }),
    )

    await expect(fetchServerHistory()).rejects.toThrow(
      'DDL history requires SELECT permission on system.query_log.',
    )
  })
})

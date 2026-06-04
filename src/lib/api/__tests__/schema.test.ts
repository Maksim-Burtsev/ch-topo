import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchServerSchema } from '../schema'

describe('Server Mode schema API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads schema through /api/schema with same-origin credentials', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          tables: [{ database: 'analytics', name: 'events' }],
          columns: [],
          indices: [],
          dictionaries: [],
          rowPolicies: [],
          grants: [],
          warnings: [],
        }),
        { status: 200 },
      ),
    )

    await expect(fetchServerSchema()).resolves.toMatchObject({
      tables: [{ database: 'analytics', name: 'events' }],
      warnings: [],
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/schema',
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
      }),
    )
  })

  it('normalizes schema API failures', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"error":"Not connected"}', { status: 401 }))

    await expect(fetchServerSchema()).rejects.toThrow('Not connected')
  })
})

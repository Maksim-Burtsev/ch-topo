import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import { connectServerMode, disconnectServerMode } from '../connection'

const params: ConnectionParams = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: 'secret',
}

describe('Server Mode connection API client', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('connects through /api/connect with same-origin credentials', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"status":"connected"}', { status: 200 }))

    await connectServerMode(params)

    expect(fetch).toHaveBeenCalledWith(
      '/api/connect',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      }),
    )
  })

  it('normalizes failed server connections', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response('{"error":"ClickHouse unavailable"}', { status: 502 }),
    )

    await expect(connectServerMode(params)).rejects.toThrow('ClickHouse unavailable')
  })

  it('disconnects through /api/disconnect with same-origin credentials', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('{"status":"disconnected"}', { status: 200 }))

    await disconnectServerMode()

    expect(fetch).toHaveBeenCalledWith(
      '/api/disconnect',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )
  })
})

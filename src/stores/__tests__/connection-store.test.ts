import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ping } from '@/lib/clickhouse/client'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import { useConnectionStore } from '../connection-store'

vi.mock('@/lib/clickhouse/client', () => ({
  ping: vi.fn().mockResolvedValue(undefined),
}))

const STORAGE_KEY = 'chtopo_connection'

function makeStorage() {
  const items = new Map<string, string>()

  return {
    getItem: vi.fn((key: string) => items.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      items.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      items.delete(key)
    }),
    clear: vi.fn(() => {
      items.clear()
    }),
  }
}

function resetStore() {
  useConnectionStore.setState({
    host: 'localhost',
    port: 8123,
    database: 'default',
    user: 'default',
    password: '',
    isConnected: false,
    isConnecting: false,
    error: null,
  })
}

describe('useConnectionStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', makeStorage())
    vi.mocked(ping).mockResolvedValue(undefined)
    resetStore()
  })

  it('does not persist the Direct Mode password after connect', async () => {
    const params: ConnectionParams = {
      host: 'db.internal',
      port: 8443,
      database: 'analytics',
      user: 'analyst',
      password: 'super-secret',
    }

    await expect(useConnectionStore.getState().connect(params)).resolves.toBe(true)

    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, unknown>
    expect(saved).toEqual({
      host: 'db.internal',
      port: 8443,
      database: 'analytics',
      user: 'analyst',
    })
    expect(saved).not.toHaveProperty('password')
    expect(useConnectionStore.getState().password).toBe('super-secret')
  })

  it('drops passwords from legacy saved connection data', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        host: 'db.internal',
        port: 8443,
        database: 'analytics',
        user: 'analyst',
        password: 'legacy-secret',
      }),
    )

    const restored = useConnectionStore.getState().restoreFromStorage()

    expect(restored).toEqual({
      host: 'db.internal',
      port: 8443,
      database: 'analytics',
      user: 'analyst',
      password: '',
    })
    expect(useConnectionStore.getState().password).toBe('')
  })
})

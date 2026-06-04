import { describe, expect, it } from 'vitest'
import type { BackendClickHouseConnection } from '../../clickhouse/types.js'
import { InMemorySessionStore } from '../store.js'

const connection: BackendClickHouseConnection = {
  host: 'clickhouse.local',
  port: 8123,
  database: 'analytics',
  user: 'readonly',
  password: 'secret',
}

describe('InMemorySessionStore', () => {
  it('stores ClickHouse credentials server-side until the TTL expires', () => {
    let now = 1_000
    const store = new InMemorySessionStore({
      ttlMs: 5_000,
      now: () => now,
      idGenerator: () => 'session-1',
    })

    const session = store.create(connection)

    expect(session).toEqual({
      id: 'session-1',
      connection,
      expiresAt: 6_000,
    })
    expect(store.get('session-1')?.connection.password).toBe('secret')

    now = 6_001

    expect(store.get('session-1')).toBeUndefined()
  })

  it('deletes expired sessions during cleanup', () => {
    let now = 1_000
    let nextId = 1
    const store = new InMemorySessionStore({
      ttlMs: 1_000,
      now: () => now,
      idGenerator: () => `session-${nextId++}`,
    })

    store.create(connection)
    now = 1_500
    store.create({ ...connection, database: 'logs' })

    now = 2_001

    expect(store.cleanupExpired()).toBe(1)
    expect(store.get('session-1')).toBeUndefined()
    expect(store.get('session-2')?.connection.database).toBe('logs')
  })

  it('deletes sessions explicitly', () => {
    const store = new InMemorySessionStore({
      ttlMs: 5_000,
      now: () => 1_000,
      idGenerator: () => 'session-1',
    })

    store.create(connection)

    expect(store.delete('session-1')).toBe(true)
    expect(store.get('session-1')).toBeUndefined()
  })
})

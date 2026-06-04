import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockedFunction } from 'vitest'
import { createApiServer } from '../app.js'
import type { BackendClickHouseConnection } from '../clickhouse/types.js'
import { InMemorySessionStore } from '../sessions/store.js'

type PingClickHouse = (connection: BackendClickHouseConnection) => Promise<void>
type QueryRows = (request: {
  connection: BackendClickHouseConnection
  sql: string
}) => Promise<unknown[]>

let server: Server
let baseUrl: string
let sessionStore: InMemorySessionStore
let pingClickHouse: MockedFunction<PingClickHouse>
let queryClickHouseRows: MockedFunction<QueryRows>

function listen(serverToStart: Server): Promise<void> {
  return new Promise((resolve) => {
    serverToStart.listen(0, '127.0.0.1', () => {
      const address = serverToStart.address() as AddressInfo
      baseUrl = `http://127.0.0.1:${address.port}`
      resolve()
    })
  })
}

function close(serverToClose: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    serverToClose.close((err) => {
      if (err) {
        reject(err)
        return
      }
      resolve()
    })
  })
}

describe('API service', () => {
  beforeEach(async () => {
    sessionStore = new InMemorySessionStore({
      ttlMs: 60_000,
      now: () => 1_000,
      idGenerator: () => 'session-1',
    })
    pingClickHouse = vi.fn<PingClickHouse>().mockResolvedValue(undefined)
    queryClickHouseRows = vi.fn<QueryRows>().mockResolvedValue([])
    server = createApiServer({
      sessionStore,
      pingClickHouse,
      queryClickHouseRows,
      sessionCleanupIntervalMs: false,
    })
    await listen(server)
  })

  afterEach(async () => {
    await close(server)
  })

  it('returns health status', async () => {
    const response = await fetch(`${baseUrl}/api/health`)

    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'chtopo-api',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
  })

  it('returns JSON 404 for unknown API routes', async () => {
    const response = await fetch(`${baseUrl}/api/missing`)

    await expect(response.json()).resolves.toEqual({
      error: 'Not found',
    })
    expect(response.status).toBe(404)
  })

  it('connects to ClickHouse, stores credentials server-side, and returns an httpOnly cookie', async () => {
    const response = await fetch(`${baseUrl}/api/connect`, {
      method: 'POST',
      body: JSON.stringify({
        host: 'clickhouse.local',
        port: 8123,
        database: 'analytics',
        user: 'readonly',
        password: 'secret',
      }),
    })

    await expect(response.json()).resolves.toEqual({
      status: 'connected',
      mode: 'server',
    })
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('ch_topo_session=session-1')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(response.headers.get('set-cookie')).toContain('SameSite=Lax')
    expect(response.headers.get('set-cookie')).not.toContain('secret')
    expect(sessionStore.get('session-1')?.connection.password).toBe('secret')
    expect(pingClickHouse).toHaveBeenCalledWith({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
  })

  it('rejects invalid connect payloads without creating a session', async () => {
    const response = await fetch(`${baseUrl}/api/connect`, {
      method: 'POST',
      body: JSON.stringify({
        host: '',
        port: 8123,
        database: 'analytics',
        user: 'readonly',
        password: 'secret',
      }),
    })

    await expect(response.json()).resolves.toEqual({
      error: 'Invalid ClickHouse connection payload',
    })
    expect(response.status).toBe(400)
    expect(sessionStore.get('session-1')).toBeUndefined()
    expect(pingClickHouse).not.toHaveBeenCalled()
  })

  it('returns a connection error without creating a session', async () => {
    pingClickHouse.mockRejectedValue(new Error('ClickHouse unavailable'))

    const response = await fetch(`${baseUrl}/api/connect`, {
      method: 'POST',
      body: JSON.stringify({
        host: 'clickhouse.local',
        port: 8123,
        database: 'analytics',
        user: 'readonly',
        password: 'secret',
      }),
    })

    await expect(response.json()).resolves.toEqual({
      error: 'ClickHouse unavailable',
    })
    expect(response.status).toBe(502)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(sessionStore.get('session-1')).toBeUndefined()
  })

  it('disconnects by deleting the server-side session and clearing the cookie', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })

    const response = await fetch(`${baseUrl}/api/disconnect`, {
      method: 'POST',
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
    })

    await expect(response.json()).resolves.toEqual({
      status: 'disconnected',
    })
    expect(response.status).toBe(200)
    expect(sessionStore.get('session-1')).toBeUndefined()
    expect(response.headers.get('set-cookie')).toContain('ch_topo_session=')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('returns schema for the active server-side session', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
    queryClickHouseRows.mockImplementation(({ sql }) => {
      if (sql.includes('FROM system.tables')) {
        return Promise.resolve([{ database: 'analytics', name: 'events' }])
      }
      return Promise.resolve([])
    })

    const response = await fetch(`${baseUrl}/api/schema`, {
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
    })

    await expect(response.json()).resolves.toEqual({
      tables: [{ database: 'analytics', name: 'events' }],
      columns: [],
      indices: [],
      dictionaries: [],
      rowPolicies: [],
      grants: [],
      warnings: [],
    })
    expect(response.status).toBe(200)
    const tablesCall = queryClickHouseRows.mock.calls.find(([request]) =>
      request.sql.includes('FROM system.tables'),
    )
    expect(tablesCall?.[0].connection.password).toBe('secret')
  })

  it('rejects schema requests without a valid session cookie', async () => {
    const response = await fetch(`${baseUrl}/api/schema`)

    await expect(response.json()).resolves.toEqual({
      error: 'Not connected',
    })
    expect(response.status).toBe(401)
    expect(queryClickHouseRows).not.toHaveBeenCalled()
  })

  it('normalizes schema load failures', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
    queryClickHouseRows.mockRejectedValue(new Error('system.tables denied'))

    const response = await fetch(`${baseUrl}/api/schema`, {
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
    })

    await expect(response.json()).resolves.toEqual({
      error: 'system.tables denied',
    })
    expect(response.status).toBe(502)
  })
})

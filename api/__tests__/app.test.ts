import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockedFunction } from 'vitest'
import { createApiServer } from '../app.js'
import { InMemoryAuditLog } from '../audit-log/store.js'
import type {
  BackendClickHouseConnection,
  BackendClickHouseResponse,
  BackendClickHouseResponseFormat,
} from '../clickhouse/types.js'
import { InMemorySessionStore } from '../sessions/store.js'

type PingClickHouse = (connection: BackendClickHouseConnection) => Promise<void>
type QueryRows = (request: {
  connection: BackendClickHouseConnection
  sql: string
}) => Promise<unknown[]>
type ExecuteClickHouse = (request: {
  connection: BackendClickHouseConnection
  sql: string
  format?: BackendClickHouseResponseFormat
  timeoutMs?: number
  signal?: AbortSignal
}) => Promise<BackendClickHouseResponse>

let server: Server
let baseUrl: string
let sessionStore: InMemorySessionStore
let pingClickHouse: MockedFunction<PingClickHouse>
let queryClickHouseRows: MockedFunction<QueryRows>
let executeClickHouseRequest: MockedFunction<ExecuteClickHouse>
let auditLog: InMemoryAuditLog

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
    executeClickHouseRequest = vi.fn<ExecuteClickHouse>().mockResolvedValue({
      ok: true,
      status: 200,
      body: JSON.stringify({
        meta: [],
        data: [],
        rows: 0,
        statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
      }),
    })
    auditLog = new InMemoryAuditLog({
      now: () => 2_000,
      idGenerator: () => `audit-${auditLog.list().length + 1}`,
    })
    server = createApiServer({
      sessionStore,
      pingClickHouse,
      queryClickHouseRows,
      executeClickHouseRequest,
      auditLog,
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
    expect(auditLog.list()).toEqual([
      expect.objectContaining({
        event: 'connect',
        status: 'success',
        sessionId: 'session-1',
        targetHost: 'clickhouse.local',
        durationMs: expect.any(Number) as number,
      }) as unknown,
    ])
    expect(JSON.stringify(auditLog.list())).not.toContain('secret')
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
    expect(auditLog.list()).toEqual([
      expect.objectContaining({
        event: 'connect',
        status: 'error',
        targetHost: 'clickhouse.local',
      }) as unknown,
    ])
    expect(JSON.stringify(auditLog.list())).not.toContain('secret')
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
    expect(auditLog.list()).toEqual([
      expect.objectContaining({
        event: 'disconnect',
        status: 'success',
        sessionId: 'session-1',
        targetHost: 'clickhouse.local',
      }) as unknown,
    ])
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

  it('returns DDL history for the active server-side session', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
    queryClickHouseRows.mockImplementation(({ sql }) => {
      if (sql.includes('FROM system.query_log')) {
        return Promise.resolve([{ event_time: '2026-01-01 00:00:00', query: 'CREATE TABLE x' }])
      }
      return Promise.resolve([])
    })

    const response = await fetch(`${baseUrl}/api/history`, {
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
    })

    await expect(response.json()).resolves.toEqual({
      entries: [{ event_time: '2026-01-01 00:00:00', query: 'CREATE TABLE x' }],
    })
    expect(response.status).toBe(200)
  })

  it('rejects history requests without a valid session cookie', async () => {
    const response = await fetch(`${baseUrl}/api/history`)

    await expect(response.json()).resolves.toEqual({
      error: 'Not connected',
    })
    expect(response.status).toBe(401)
    expect(queryClickHouseRows).not.toHaveBeenCalled()
  })

  it('returns normalized history errors', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
    queryClickHouseRows.mockRejectedValue(
      new Error('ACCESS_DENIED: Not enough privileges for system.query_log'),
    )

    const response = await fetch(`${baseUrl}/api/history`, {
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
    })

    await expect(response.json()).resolves.toEqual({
      error: 'DDL history requires SELECT permission on system.query_log.',
    })
    expect(response.status).toBe(403)
  })

  it('executes query requests for the active server-side session', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
    executeClickHouseRequest.mockResolvedValue({
      ok: true,
      status: 200,
      body: JSON.stringify({
        meta: [{ name: 'id', type: 'UInt64' }],
        data: [{ id: 1 }],
        rows: 1,
        statistics: { elapsed: 0.05, rows_read: 10, bytes_read: 200 },
      }),
    })

    const response = await fetch(`${baseUrl}/api/query`, {
      method: 'POST',
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
      body: JSON.stringify({
        sql: 'SELECT id FROM events',
        timeoutMs: 1_000,
        maxRows: 100,
      }),
    })

    await expect(response.json()).resolves.toEqual({
      columns: [{ name: 'id', type: 'UInt64' }],
      rows: [{ id: 1 }],
      elapsed: 0.05,
      rowsRead: 10,
      bytesRead: 200,
    })
    expect(response.status).toBe(200)
    expect(executeClickHouseRequest.mock.calls[0]?.[0].connection.password).toBe('secret')
    expect(auditLog.list()).toEqual([
      expect.objectContaining({
        event: 'query',
        status: 'success',
        sessionId: 'session-1',
        targetHost: 'clickhouse.local',
        queryKind: 'SELECT',
      }) as unknown,
    ])
    expect(JSON.stringify(auditLog.list())).not.toContain('SELECT id FROM events')
    expect(JSON.stringify(auditLog.list())).not.toContain('secret')
  })

  it('returns consistent query errors', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
    executeClickHouseRequest.mockRejectedValue(new Error('boom'))

    const response = await fetch(`${baseUrl}/api/query`, {
      method: 'POST',
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
      body: JSON.stringify({
        sql: 'SELECT 1',
      }),
    })

    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'boom',
        statusCode: 502,
      },
    })
    expect(response.status).toBe(502)
  })

  it('returns query safety errors before reaching ClickHouse', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })

    const response = await fetch(`${baseUrl}/api/query`, {
      method: 'POST',
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
      body: JSON.stringify({
        sql: 'INSERT INTO audit VALUES (1)',
        readOnly: false,
      }),
    })

    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'INSERT queries require explicit confirmation.',
        statusCode: 409,
        code: 'QUERY_CONFIRMATION_REQUIRED',
      },
    })
    expect(response.status).toBe(409)
    expect(executeClickHouseRequest).not.toHaveBeenCalled()
  })

  it('executes explain requests for the active server-side session', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
    executeClickHouseRequest.mockResolvedValue({
      ok: true,
      status: 200,
      body: 'ReadFromMergeTree',
    })

    const response = await fetch(`${baseUrl}/api/explain`, {
      method: 'POST',
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
      body: JSON.stringify({
        sql: 'SELECT * FROM events',
        mode: 'pipeline',
        timeoutMs: 1_000,
      }),
    })

    await expect(response.json()).resolves.toEqual({
      mode: 'pipeline',
      text: 'ReadFromMergeTree',
    })
    expect(response.status).toBe(200)
    expect(executeClickHouseRequest.mock.calls[0]?.[0].sql).toContain('EXPLAIN PIPELINE')
  })

  it('returns consistent explain errors', async () => {
    sessionStore.create({
      host: 'clickhouse.local',
      port: 8123,
      database: 'analytics',
      user: 'readonly',
      password: 'secret',
    })
    executeClickHouseRequest.mockRejectedValue(new Error('explain failed'))

    const response = await fetch(`${baseUrl}/api/explain`, {
      method: 'POST',
      headers: {
        Cookie: 'ch_topo_session=session-1',
      },
      body: JSON.stringify({
        sql: 'SELECT 1',
      }),
    })

    await expect(response.json()).resolves.toEqual({
      error: {
        message: 'explain failed',
        statusCode: 502,
      },
    })
    expect(response.status).toBe(502)
  })
})

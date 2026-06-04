import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { queryClickHouseRows as defaultQueryClickHouseRows } from './clickhouse/client.js'
import type { BackendClickHouseConnection } from './clickhouse/types.js'
import { HistoryLoadError, loadHistory } from './history/service.js'
import { loadSchema } from './schema/service.js'
import type { SchemaQueryRows } from './schema/types.js'
import { InMemorySessionStore } from './sessions/store.js'

const SESSION_COOKIE_NAME = 'ch_topo_session'
const JSON_BODY_LIMIT_BYTES = 16 * 1024

export interface ApiServerOptions {
  sessionStore?: InMemorySessionStore
  pingClickHouse?: (connection: BackendClickHouseConnection) => Promise<void>
  queryClickHouseRows?: SchemaQueryRows
  sessionCleanupIntervalMs?: number | false
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  })
  res.end(`${JSON.stringify(body)}\n`)
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {}

  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name = '', ...valueParts] = part.split('=')
        return [name, decodeURIComponent(valueParts.join('='))]
      }),
  )
}

function sessionCookie(sessionId: string, ttlMs: number) {
  const maxAgeSeconds = Math.max(1, Math.floor(ttlMs / 1000))
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
}

function clearedSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}

function getSessionConnection(
  req: IncomingMessage,
  sessionStore: InMemorySessionStore,
): BackendClickHouseConnection | undefined {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]
  if (!sessionId) return undefined
  return sessionStore.get(sessionId)?.connection
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function parseConnectionPayload(value: unknown): BackendClickHouseConnection | undefined {
  if (!isRecord(value)) return undefined

  const { host, port, database, user, password } = value

  if (
    !nonEmptyString(host) ||
    !Number.isInteger(port) ||
    typeof port !== 'number' ||
    port < 1 ||
    port > 65_535 ||
    !nonEmptyString(database) ||
    !nonEmptyString(user) ||
    !optionalString(password)
  ) {
    return undefined
  }

  return {
    host,
    port,
    database,
    user,
    password: password ?? '',
  }
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  let body = ''

  for await (const chunk of req) {
    body += String(chunk)

    if (Buffer.byteLength(body) > JSON_BODY_LIMIT_BYTES) {
      throw new Error('Request body too large')
    }
  }

  if (!body.trim()) return {}

  return JSON.parse(body) as unknown
}

async function defaultPingClickHouse(connection: BackendClickHouseConnection) {
  await defaultQueryClickHouseRows<{ '1': number }>({
    connection,
    sql: 'SELECT 1',
    timeoutMs: 5_000,
  })
}

async function handleConnect(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  pingClickHouse: (connection: BackendClickHouseConnection) => Promise<void>,
) {
  let payload: unknown

  try {
    payload = await readJsonBody(req)
  } catch {
    sendJson(res, 400, {
      error: 'Invalid JSON request body',
    })
    return
  }

  const connection = parseConnectionPayload(payload)

  if (!connection) {
    sendJson(res, 400, {
      error: 'Invalid ClickHouse connection payload',
    })
    return
  }

  try {
    await pingClickHouse(connection)
  } catch (err) {
    sendJson(res, 502, {
      error: err instanceof Error ? err.message : 'ClickHouse connection failed',
    })
    return
  }

  const session = sessionStore.create(connection)

  sendJson(
    res,
    200,
    {
      status: 'connected',
      mode: 'server',
    },
    {
      'Set-Cookie': sessionCookie(session.id, sessionStore.ttlMs),
    },
  )
}

async function handleSchema(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  queryRows: SchemaQueryRows,
) {
  const connection = getSessionConnection(req, sessionStore)

  if (!connection) {
    sendJson(res, 401, {
      error: 'Not connected',
    })
    return
  }

  try {
    sendJson(res, 200, await loadSchema(connection, queryRows))
  } catch (err) {
    sendJson(res, 502, {
      error: err instanceof Error ? err.message : 'Failed to load schema',
    })
  }
}

async function handleHistory(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  queryRows: SchemaQueryRows,
) {
  const connection = getSessionConnection(req, sessionStore)

  if (!connection) {
    sendJson(res, 401, {
      error: 'Not connected',
    })
    return
  }

  try {
    sendJson(res, 200, {
      entries: await loadHistory(connection, queryRows),
    })
  } catch (err) {
    sendJson(res, err instanceof HistoryLoadError ? err.statusCode : 502, {
      error: err instanceof Error ? err.message : 'Failed to load DDL history',
    })
  }
}

function handleDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
) {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]

  if (sessionId) {
    sessionStore.delete(sessionId)
  }

  sendJson(
    res,
    200,
    {
      status: 'disconnected',
    },
    {
      'Set-Cookie': clearedSessionCookie(),
    },
  )
}

export async function handleApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: Required<ApiServerOptions>,
) {
  const method = req.method ?? 'GET'
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'chtopo-api',
    })
    return
  }

  if (method === 'POST' && url.pathname === '/api/connect') {
    await handleConnect(req, res, options.sessionStore, options.pingClickHouse)
    return
  }

  if (method === 'POST' && url.pathname === '/api/disconnect') {
    handleDisconnect(req, res, options.sessionStore)
    return
  }

  if (method === 'GET' && url.pathname === '/api/schema') {
    await handleSchema(req, res, options.sessionStore, options.queryClickHouseRows)
    return
  }

  if (method === 'GET' && url.pathname === '/api/history') {
    await handleHistory(req, res, options.sessionStore, options.queryClickHouseRows)
    return
  }

  sendJson(res, 404, {
    error: 'Not found',
  })
}

export function createApiServer(options: ApiServerOptions = {}): Server {
  const serverOptions: Required<ApiServerOptions> = {
    sessionStore: options.sessionStore ?? new InMemorySessionStore(),
    pingClickHouse: options.pingClickHouse ?? defaultPingClickHouse,
    queryClickHouseRows: options.queryClickHouseRows ?? defaultQueryClickHouseRows,
    sessionCleanupIntervalMs: options.sessionCleanupIntervalMs ?? 60_000,
  }

  const cleanupTimer =
    serverOptions.sessionCleanupIntervalMs === false
      ? undefined
      : setInterval(() => {
          serverOptions.sessionStore.cleanupExpired()
        }, serverOptions.sessionCleanupIntervalMs)

  cleanupTimer?.unref()

  const server = createServer((req, res) => {
    void handleApiRequest(req, res, serverOptions).catch((err: unknown) => {
      sendJson(res, 500, {
        error: err instanceof Error ? err.message : 'Internal server error',
      })
    })
  })

  server.on('close', () => {
    if (cleanupTimer) {
      clearInterval(cleanupTimer)
    }
  })

  return server
}

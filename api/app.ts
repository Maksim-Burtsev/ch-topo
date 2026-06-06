import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { InMemoryAuditLog } from './audit-log/store.js'
import type { AuditEventKind, AuditLog } from './audit-log/store.js'
import {
  executeClickHouseRequest as defaultExecuteClickHouseRequest,
  queryClickHouseRows as defaultQueryClickHouseRows,
} from './clickhouse/client.js'
import type { BackendClickHouseConnection } from './clickhouse/types.js'
import { explainQuery } from './explain/service.js'
import type { ExplainMode, ExplainRequestPayload } from './explain/types.js'
import { HistoryLoadError, loadHistory } from './history/service.js'
import { executeQuery, QueryExecutionError } from './query/service.js'
import type { ClickHouseExecute, QueryRequestPayload } from './query/types.js'
import { loadSchema } from './schema/service.js'
import type { SchemaQueryRows } from './schema/types.js'
import { InMemorySessionStore } from './sessions/store.js'

const SESSION_COOKIE_NAME = 'ch_topo_session'
const JSON_BODY_LIMIT_BYTES = 16 * 1024

export interface ApiServerOptions {
  sessionStore?: InMemorySessionStore
  pingClickHouse?: (connection: BackendClickHouseConnection) => Promise<void>
  queryClickHouseRows?: SchemaQueryRows
  executeClickHouseRequest?: ClickHouseExecute
  auditLog?: AuditLog
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

interface SessionContext {
  sessionId: string
  connection: BackendClickHouseConnection
}

function getSessionContext(
  req: IncomingMessage,
  sessionStore: InMemorySessionStore,
): SessionContext | undefined {
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]
  if (!sessionId) return undefined

  const session = sessionStore.get(sessionId)
  if (!session) return undefined

  return {
    sessionId: session.id,
    connection: session.connection,
  }
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

function optionalPositiveInteger(value: unknown): value is number | undefined {
  return value === undefined || (Number.isInteger(value) && typeof value === 'number' && value > 0)
}

function optionalBoolean(value: unknown): value is boolean | undefined {
  return value === undefined || typeof value === 'boolean'
}

function isExplainMode(value: unknown): value is ExplainMode | undefined {
  return value === undefined || value === 'plan' || value === 'pipeline' || value === 'syntax'
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

function parseQueryPayload(value: unknown): QueryRequestPayload | undefined {
  if (!isRecord(value)) return undefined

  const { sql, timeoutMs, maxRows, maxBytes, readOnly, confirmedMutating } = value

  if (
    !nonEmptyString(sql) ||
    !optionalPositiveInteger(timeoutMs) ||
    !optionalPositiveInteger(maxRows) ||
    !optionalPositiveInteger(maxBytes) ||
    !optionalBoolean(readOnly) ||
    !optionalBoolean(confirmedMutating)
  ) {
    return undefined
  }

  return {
    sql,
    timeoutMs,
    maxRows,
    maxBytes,
    readOnly,
    confirmedMutating,
  }
}

function parseExplainPayload(value: unknown): ExplainRequestPayload | undefined {
  if (!isRecord(value)) return undefined

  const { sql, mode, timeoutMs } = value

  if (!nonEmptyString(sql) || !isExplainMode(mode) || !optionalPositiveInteger(timeoutMs)) {
    return undefined
  }

  return {
    sql,
    mode,
    timeoutMs,
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

function elapsedMs(startedAt: number) {
  return Math.max(0, Date.now() - startedAt)
}

function auditEvent(
  auditLog: AuditLog,
  event: {
    event: AuditEventKind
    status: 'success' | 'error'
    startedAt: number
    sessionId?: string
    targetHost?: string
    queryKind?: string
    statusCode?: number
    errorCode?: string
  },
) {
  auditLog.append({
    event: event.event,
    status: event.status,
    durationMs: elapsedMs(event.startedAt),
    sessionId: event.sessionId,
    targetHost: event.targetHost,
    queryKind: event.queryKind,
    statusCode: event.statusCode,
    errorCode: event.errorCode,
  })
}

function queryKind(sql: string) {
  return /^[\s;(]*(?:--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\s)*([A-Za-z_]+)/u
    .exec(sql)?.[1]
    ?.toUpperCase()
}

async function handleConnect(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  pingClickHouse: (connection: BackendClickHouseConnection) => Promise<void>,
  auditLog: AuditLog,
) {
  const startedAt = Date.now()
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
    auditEvent(auditLog, {
      event: 'connect',
      status: 'error',
      startedAt,
      statusCode: 400,
    })
    return
  }

  try {
    await pingClickHouse(connection)
  } catch (err) {
    sendJson(res, 502, {
      error: err instanceof Error ? err.message : 'ClickHouse connection failed',
    })
    auditEvent(auditLog, {
      event: 'connect',
      status: 'error',
      startedAt,
      targetHost: connection.host,
      statusCode: 502,
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
  auditEvent(auditLog, {
    event: 'connect',
    status: 'success',
    startedAt,
    sessionId: session.id,
    targetHost: connection.host,
    statusCode: 200,
  })
}

async function handleSchema(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  queryRows: SchemaQueryRows,
  auditLog: AuditLog,
) {
  const startedAt = Date.now()
  const session = getSessionContext(req, sessionStore)

  if (!session) {
    sendJson(res, 401, {
      error: 'Not connected',
    })
    auditEvent(auditLog, {
      event: 'schema',
      status: 'error',
      startedAt,
      statusCode: 401,
    })
    return
  }

  try {
    sendJson(res, 200, await loadSchema(session.connection, queryRows))
    auditEvent(auditLog, {
      event: 'schema',
      status: 'success',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      queryKind: 'SCHEMA',
      statusCode: 200,
    })
  } catch (err) {
    sendJson(res, 502, {
      error: err instanceof Error ? err.message : 'Failed to load schema',
    })
    auditEvent(auditLog, {
      event: 'schema',
      status: 'error',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      queryKind: 'SCHEMA',
      statusCode: 502,
    })
  }
}

async function handleHistory(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  queryRows: SchemaQueryRows,
  auditLog: AuditLog,
) {
  const startedAt = Date.now()
  const session = getSessionContext(req, sessionStore)

  if (!session) {
    sendJson(res, 401, {
      error: 'Not connected',
    })
    auditEvent(auditLog, {
      event: 'history',
      status: 'error',
      startedAt,
      statusCode: 401,
    })
    return
  }

  try {
    sendJson(res, 200, {
      entries: await loadHistory(session.connection, queryRows),
    })
    auditEvent(auditLog, {
      event: 'history',
      status: 'success',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      queryKind: 'HISTORY',
      statusCode: 200,
    })
  } catch (err) {
    const statusCode = err instanceof HistoryLoadError ? err.statusCode : 502
    sendJson(res, statusCode, {
      error: err instanceof Error ? err.message : 'Failed to load DDL history',
    })
    auditEvent(auditLog, {
      event: 'history',
      status: 'error',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      queryKind: 'HISTORY',
      statusCode,
    })
  }
}

async function handleQuery(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  execute: ClickHouseExecute,
  auditLog: AuditLog,
) {
  const startedAt = Date.now()
  const session = getSessionContext(req, sessionStore)

  if (!session) {
    sendJson(res, 401, {
      error: {
        message: 'Not connected',
        statusCode: 401,
      },
    })
    auditEvent(auditLog, {
      event: 'query',
      status: 'error',
      startedAt,
      statusCode: 401,
    })
    return
  }

  let payload: unknown

  try {
    payload = await readJsonBody(req)
  } catch {
    sendJson(res, 400, {
      error: {
        message: 'Invalid JSON request body',
        statusCode: 400,
      },
    })
    return
  }

  const queryPayload = parseQueryPayload(payload)

  if (!queryPayload) {
    sendJson(res, 400, {
      error: {
        message: 'Invalid query payload',
        statusCode: 400,
      },
    })
    auditEvent(auditLog, {
      event: 'query',
      status: 'error',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      statusCode: 400,
    })
    return
  }

  const controller = new AbortController()
  const abort = () => {
    if (!res.writableEnded) {
      controller.abort()
    }
  }

  req.on('aborted', abort)
  res.on('close', abort)

  try {
    sendJson(
      res,
      200,
      await executeQuery(session.connection, queryPayload, execute, controller.signal),
    )
    auditEvent(auditLog, {
      event: 'query',
      status: 'success',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      queryKind: queryKind(queryPayload.sql),
      statusCode: 200,
    })
  } catch (err) {
    if (err instanceof QueryExecutionError) {
      sendJson(res, err.payload.statusCode, {
        error: err.payload,
      })
      auditEvent(auditLog, {
        event: 'query',
        status: 'error',
        startedAt,
        sessionId: session.sessionId,
        targetHost: session.connection.host,
        queryKind: queryKind(queryPayload.sql),
        statusCode: err.payload.statusCode,
        errorCode: err.payload.code,
      })
      return
    }

    sendJson(res, 502, {
      error: {
        message: err instanceof Error ? err.message : 'Failed to execute query',
        statusCode: 502,
      },
    })
    auditEvent(auditLog, {
      event: 'query',
      status: 'error',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      queryKind: queryKind(queryPayload.sql),
      statusCode: 502,
    })
  } finally {
    req.off('aborted', abort)
    res.off('close', abort)
  }
}

async function handleExplain(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  execute: ClickHouseExecute,
  auditLog: AuditLog,
) {
  const startedAt = Date.now()
  const session = getSessionContext(req, sessionStore)

  if (!session) {
    sendJson(res, 401, {
      error: {
        message: 'Not connected',
        statusCode: 401,
      },
    })
    auditEvent(auditLog, {
      event: 'explain',
      status: 'error',
      startedAt,
      statusCode: 401,
    })
    return
  }

  let payload: unknown

  try {
    payload = await readJsonBody(req)
  } catch {
    sendJson(res, 400, {
      error: {
        message: 'Invalid JSON request body',
        statusCode: 400,
      },
    })
    return
  }

  const explainPayload = parseExplainPayload(payload)

  if (!explainPayload) {
    sendJson(res, 400, {
      error: {
        message: 'Invalid explain payload',
        statusCode: 400,
      },
    })
    auditEvent(auditLog, {
      event: 'explain',
      status: 'error',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      statusCode: 400,
    })
    return
  }

  const controller = new AbortController()
  const abort = () => {
    if (!res.writableEnded) {
      controller.abort()
    }
  }

  req.on('aborted', abort)
  res.on('close', abort)

  try {
    sendJson(
      res,
      200,
      await explainQuery(session.connection, explainPayload, execute, controller.signal),
    )
    auditEvent(auditLog, {
      event: 'explain',
      status: 'success',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      queryKind: explainPayload.mode ?? 'plan',
      statusCode: 200,
    })
  } catch (err) {
    if (err instanceof QueryExecutionError) {
      sendJson(res, err.payload.statusCode, {
        error: err.payload,
      })
      auditEvent(auditLog, {
        event: 'explain',
        status: 'error',
        startedAt,
        sessionId: session.sessionId,
        targetHost: session.connection.host,
        queryKind: explainPayload.mode ?? 'plan',
        statusCode: err.payload.statusCode,
        errorCode: err.payload.code,
      })
      return
    }

    sendJson(res, 502, {
      error: {
        message: err instanceof Error ? err.message : 'Failed to explain query',
        statusCode: 502,
      },
    })
    auditEvent(auditLog, {
      event: 'explain',
      status: 'error',
      startedAt,
      sessionId: session.sessionId,
      targetHost: session.connection.host,
      queryKind: explainPayload.mode ?? 'plan',
      statusCode: 502,
    })
  } finally {
    req.off('aborted', abort)
    res.off('close', abort)
  }
}

function handleDisconnect(
  req: IncomingMessage,
  res: ServerResponse,
  sessionStore: InMemorySessionStore,
  auditLog: AuditLog,
) {
  const startedAt = Date.now()
  const sessionId = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME]
  const session = sessionId ? sessionStore.get(sessionId) : undefined

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
  auditEvent(auditLog, {
    event: 'disconnect',
    status: 'success',
    startedAt,
    sessionId,
    targetHost: session?.connection.host,
    statusCode: 200,
  })
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
    await handleConnect(req, res, options.sessionStore, options.pingClickHouse, options.auditLog)
    return
  }

  if (method === 'POST' && url.pathname === '/api/disconnect') {
    handleDisconnect(req, res, options.sessionStore, options.auditLog)
    return
  }

  if (method === 'GET' && url.pathname === '/api/schema') {
    await handleSchema(
      req,
      res,
      options.sessionStore,
      options.queryClickHouseRows,
      options.auditLog,
    )
    return
  }

  if (method === 'GET' && url.pathname === '/api/history') {
    await handleHistory(
      req,
      res,
      options.sessionStore,
      options.queryClickHouseRows,
      options.auditLog,
    )
    return
  }

  if (method === 'POST' && url.pathname === '/api/query') {
    await handleQuery(
      req,
      res,
      options.sessionStore,
      options.executeClickHouseRequest,
      options.auditLog,
    )
    return
  }

  if (method === 'POST' && url.pathname === '/api/explain') {
    await handleExplain(
      req,
      res,
      options.sessionStore,
      options.executeClickHouseRequest,
      options.auditLog,
    )
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
    executeClickHouseRequest: options.executeClickHouseRequest ?? defaultExecuteClickHouseRequest,
    auditLog: options.auditLog ?? new InMemoryAuditLog(),
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

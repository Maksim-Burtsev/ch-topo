import { executeClickHouseRequest } from '@/lib/clickhouse/transport'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import { validateQuerySafety } from './safety'

// ── Types ──────────────────────────────────────────────────────

export interface QueryColumn {
  name: string
  type: string
}

export interface QueryResult {
  columns: QueryColumn[]
  rows: Record<string, unknown>[]
  elapsed: number
  rowsRead: number
  bytesRead: number
  error?: string
  errorLine?: number
  sessionExpired?: boolean
}

interface ClickHouseJsonResponse {
  meta: QueryColumn[]
  data: Record<string, unknown>[]
  rows: number
  statistics: {
    elapsed: number
    rows_read: number
    bytes_read: number
  }
}

export interface ExecuteOptions {
  timeoutMs?: number
  signal?: AbortSignal
  readOnlyMode?: boolean
  confirmedMutating?: boolean
  connectionMode?: 'direct' | 'server' | 'demo'
}

const DEFAULT_TIMEOUT_MS = 30_000

interface QueryApiErrorBody {
  error?: unknown
}

interface QueryApiErrorPayload {
  message?: unknown
  errorLine?: unknown
}

// ── Error parsing ──────────────────────────────────────────────

const LINE_NUMBER_RE = /\(line\s+(\d+),/i

export function parseErrorLine(message: string): number | undefined {
  const match = LINE_NUMBER_RE.exec(message)
  if (match?.[1]) {
    return parseInt(match[1], 10)
  }
  return undefined
}

// ── Summary header parsing ─────────────────────────────────────

interface ClickHouseSummary {
  read_rows?: number
  read_bytes?: number
  elapsed_ns?: number
}

export function parseSummaryHeader(header: string | null): ClickHouseSummary | undefined {
  if (!header) return undefined
  try {
    return JSON.parse(header) as ClickHouseSummary
  } catch {
    return undefined
  }
}

function isQueryApiErrorPayload(value: unknown): value is QueryApiErrorPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readServerQueryError(response: Response): Promise<{
  message: string
  errorLine?: number
  sessionExpired: boolean
}> {
  if (response.status === 401) {
    return {
      message: 'Server session expired. Reconnect to ClickHouse and run the query again.',
      sessionExpired: true,
    }
  }

  try {
    const body = (await response.json()) as QueryApiErrorBody
    const error = body.error

    if (isQueryApiErrorPayload(error) && typeof error.message === 'string') {
      return {
        message: error.message,
        errorLine: typeof error.errorLine === 'number' ? error.errorLine : undefined,
        sessionExpired: false,
      }
    }

    if (typeof error === 'string' && error.trim()) {
      return { message: error, sessionExpired: false }
    }
  } catch {
    // Fall back to HTTP status below.
  }

  return { message: `HTTP ${response.status}`, sessionExpired: false }
}

async function executeServerQuery(sql: string, options?: ExecuteOptions): Promise<QueryResult> {
  let response: Response

  try {
    response = await fetch('/api/query', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        timeoutMs: options?.timeoutMs,
        readOnly: options?.readOnlyMode ?? true,
        confirmedMutating: options?.confirmedMutating,
      }),
      signal: options?.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return {
        columns: [],
        rows: [],
        elapsed: 0,
        rowsRead: 0,
        bytesRead: 0,
        error: 'Query cancelled',
      }
    }

    if (err instanceof TypeError) {
      return {
        columns: [],
        rows: [],
        elapsed: 0,
        rowsRead: 0,
        bytesRead: 0,
        error:
          'Network error: Cannot reach the ch-topo API. Check that the local API server is running.',
      }
    }

    return {
      columns: [],
      rows: [],
      elapsed: 0,
      rowsRead: 0,
      bytesRead: 0,
      error: err instanceof Error ? err.message : 'Failed to execute query',
    }
  }

  if (!response.ok) {
    const error = await readServerQueryError(response)
    return {
      columns: [],
      rows: [],
      elapsed: 0,
      rowsRead: 0,
      bytesRead: 0,
      error: error.message,
      errorLine: error.errorLine,
      sessionExpired: error.sessionExpired,
    }
  }

  return (await response.json()) as QueryResult
}

// ── Execute query ──────────────────────────────────────────────

export async function executeQuery(
  sql: string,
  params: ConnectionParams,
  options?: ExecuteOptions,
): Promise<QueryResult> {
  const safety = validateQuerySafety(sql, {
    readOnlyMode: options?.readOnlyMode ?? true,
    confirmedMutating: options?.confirmedMutating,
  })

  if (!safety.allowed) {
    return {
      columns: [],
      rows: [],
      elapsed: 0,
      rowsRead: 0,
      bytesRead: 0,
      error: safety.message,
    }
  }

  if (options?.connectionMode === 'demo') {
    return {
      columns: [],
      rows: [],
      elapsed: 0,
      rowsRead: 0,
      bytesRead: 0,
      error: 'Demo Mode cannot execute queries. Connect to ClickHouse to run SQL.',
    }
  }

  if (options?.connectionMode === 'server') {
    return executeServerQuery(sql, options)
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const controller = new AbortController()

  // Link external signal to our controller
  if (options?.signal) {
    if (options.signal.aborted) {
      controller.abort(options.signal.reason)
    } else {
      options.signal.addEventListener(
        'abort',
        () => {
          controller.abort(options.signal?.reason)
        },
        { once: true },
      )
    }
  }

  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Query timed out', 'TimeoutError'))
  }, timeoutMs)

  try {
    const response = await executeClickHouseRequest({
      params,
      sql,
      format: 'JSON',
      signal: controller.signal,
    })

    const body = response.body

    if (!response.ok) {
      const errorMessage = body.trim() || `HTTP ${response.status}`
      return {
        columns: [],
        rows: [],
        elapsed: 0,
        rowsRead: 0,
        bytesRead: 0,
        error: errorMessage,
        errorLine: parseErrorLine(errorMessage),
      }
    }

    // Parse the JSON response from ClickHouse FORMAT JSON
    const parsed = JSON.parse(body) as ClickHouseJsonResponse

    const { elapsed, rows_read: rowsRead, bytes_read: bytesRead } = parsed.statistics

    return {
      columns: parsed.meta,
      rows: parsed.data,
      elapsed,
      rowsRead,
      bytesRead,
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const reason =
        controller.signal.reason instanceof DOMException &&
        controller.signal.reason.name === 'TimeoutError'
          ? `Query timed out after ${timeoutMs}ms`
          : 'Query cancelled'
      return {
        columns: [],
        rows: [],
        elapsed: 0,
        rowsRead: 0,
        bytesRead: 0,
        error: reason,
      }
    }

    if (err instanceof TypeError) {
      return {
        columns: [],
        rows: [],
        elapsed: 0,
        rowsRead: 0,
        bytesRead: 0,
        error: `Network error: Cannot reach ${params.host}:${params.port}. Check that ClickHouse is running and CORS is configured.`,
      }
    }

    const message = err instanceof Error ? err.message : 'Unknown error'
    return {
      columns: [],
      rows: [],
      elapsed: 0,
      rowsRead: 0,
      bytesRead: 0,
      error: message,
      errorLine: parseErrorLine(message),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

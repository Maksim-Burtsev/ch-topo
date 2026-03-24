import type { ConnectionParams } from '@/lib/clickhouse/types'

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
}

const DEFAULT_TIMEOUT_MS = 30_000

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

// ── Execute query ──────────────────────────────────────────────

export async function executeQuery(
  sql: string,
  params: ConnectionParams,
  options?: ExecuteOptions,
): Promise<QueryResult> {
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

  const url = `http://${params.host}:${params.port}/`

  const headers: Record<string, string> = {
    'X-ClickHouse-User': params.user,
    'X-ClickHouse-Database': params.database,
  }
  if (params.password) {
    headers['X-ClickHouse-Key'] = params.password
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: `${sql} FORMAT JSON`,
      signal: controller.signal,
    })

    const body = await response.text()

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

import { BackendClickHouseError } from '../clickhouse/client.js'
import type { BackendClickHouseConnection } from '../clickhouse/types.js'
import type {
  ClickHouseExecute,
  QueryErrorPayload,
  QueryRequestPayload,
  QueryResult,
} from './types.js'

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_ROWS = 1_000
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

const LINE_NUMBER_RE = /\(line\s+(\d+),/i

interface ClickHouseJsonResponse {
  meta: { name: string; type: string }[]
  data: Record<string, unknown>[]
  statistics: {
    elapsed: number
    rows_read: number
    bytes_read: number
  }
}

export class QueryExecutionError extends Error {
  payload: QueryErrorPayload['error']

  constructor(payload: QueryErrorPayload['error']) {
    super(payload.message)
    this.name = 'QueryExecutionError'
    this.payload = payload
  }
}

function parseErrorLine(message: string): number | undefined {
  const match = LINE_NUMBER_RE.exec(message)
  return match?.[1] ? Number.parseInt(match[1], 10) : undefined
}

function trimTrailingSemicolons(sql: string) {
  return sql.trim().replace(/[;\s]+$/u, '')
}

function limitValue(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : fallback
}

function buildLimitedSql(payload: QueryRequestPayload) {
  const sql = trimTrailingSemicolons(payload.sql)
  const maxRows = limitValue(payload.maxRows, DEFAULT_MAX_ROWS)
  const maxBytes = limitValue(payload.maxBytes, DEFAULT_MAX_BYTES)

  return `${sql} SETTINGS max_result_rows = ${maxRows}, max_result_bytes = ${maxBytes}, result_overflow_mode = 'break'`
}

function normalizeQueryError(err: unknown): QueryExecutionError {
  if (err instanceof BackendClickHouseError) {
    return new QueryExecutionError({
      message: err.message,
      statusCode: err.statusCode || 502,
      code: err.code,
      errorLine: parseErrorLine(err.message),
    })
  }

  const message = err instanceof Error ? err.message : 'Failed to execute query'
  return new QueryExecutionError({
    message,
    statusCode: 502,
    errorLine: parseErrorLine(message),
  })
}

export async function executeQuery(
  connection: BackendClickHouseConnection,
  payload: QueryRequestPayload,
  execute: ClickHouseExecute,
  signal?: AbortSignal,
): Promise<QueryResult> {
  try {
    const response = await execute({
      connection,
      sql: buildLimitedSql(payload),
      format: 'JSON',
      timeoutMs: limitValue(payload.timeoutMs, DEFAULT_TIMEOUT_MS),
      signal,
    })
    const parsed = JSON.parse(response.body) as ClickHouseJsonResponse

    return {
      columns: parsed.meta,
      rows: parsed.data,
      elapsed: parsed.statistics.elapsed,
      rowsRead: parsed.statistics.rows_read,
      bytesRead: parsed.statistics.bytes_read,
    }
  } catch (err) {
    throw normalizeQueryError(err)
  }
}

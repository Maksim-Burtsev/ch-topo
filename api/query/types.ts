import type {
  BackendClickHouseConnection,
  BackendClickHouseRequest,
  BackendClickHouseResponse,
} from '../clickhouse/types.js'

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
}

export interface QueryRequestPayload {
  sql: string
  timeoutMs?: number
  maxRows?: number
  maxBytes?: number
}

export interface QueryErrorPayload {
  error: {
    message: string
    statusCode: number
    code?: string
    errorLine?: number
  }
}

export type ClickHouseExecute = (
  request: BackendClickHouseRequest & { connection: BackendClickHouseConnection },
) => Promise<BackendClickHouseResponse>

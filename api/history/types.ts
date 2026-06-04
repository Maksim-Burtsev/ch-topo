import type { BackendClickHouseConnection } from '../clickhouse/types.js'

export interface RawDDLHistoryRow {
  event_time: string
  query: string
  type: string
  exception: string
  query_duration_ms: string
  user: string
  initial_user: string
  query_kind: string
  current_database: string
}

export interface HistoryQueryRequest {
  connection: BackendClickHouseConnection
  sql: string
  timeoutMs?: number
}

export type HistoryQueryRows = <T>(request: HistoryQueryRequest) => Promise<T[]>

export type BackendClickHouseResponseFormat = 'JSONEachRow' | 'JSON'

export interface BackendClickHouseConnection {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export interface BackendClickHouseRequest {
  connection: BackendClickHouseConnection
  sql: string
  format?: BackendClickHouseResponseFormat
  timeoutMs?: number
  signal?: AbortSignal
}

export interface BackendClickHouseResponse {
  ok: boolean
  status: number
  body: string
}

import type { ConnectionParams } from './types'

export type ClickHouseResponseFormat = 'JSONEachRow' | 'JSON'

export interface ClickHouseTransportRequest {
  params: ConnectionParams
  sql: string
  format?: ClickHouseResponseFormat
  signal?: AbortSignal
}

export interface ClickHouseTransportResponse {
  ok: boolean
  status: number
  body: string
}

export interface ClickHouseTransport {
  execute: (request: ClickHouseTransportRequest) => Promise<ClickHouseTransportResponse>
}

function buildHeaders(params: ConnectionParams): Record<string, string> {
  const headers: Record<string, string> = {
    'X-ClickHouse-User': params.user,
    'X-ClickHouse-Database': params.database,
  }

  if (params.password) {
    headers['X-ClickHouse-Key'] = params.password
  }

  return headers
}

function withFormat(sql: string, format?: ClickHouseResponseFormat): string {
  if (!format) return sql
  return `${sql} FORMAT ${format}`
}

export const directClickHouseTransport: ClickHouseTransport = {
  execute: async ({ params, sql, format, signal }) => {
    const response = await fetch(`http://${params.host}:${params.port}/`, {
      method: 'POST',
      headers: buildHeaders(params),
      body: withFormat(sql, format),
      signal,
    })

    return {
      ok: response.ok,
      status: response.status,
      body: await response.text(),
    }
  },
}

let activeTransport: ClickHouseTransport = directClickHouseTransport

export function setClickHouseTransport(transport: ClickHouseTransport) {
  activeTransport = transport
}

export function resetClickHouseTransport() {
  activeTransport = directClickHouseTransport
}

export function getClickHouseTransport() {
  return activeTransport
}

export function executeClickHouseRequest(request: ClickHouseTransportRequest) {
  return activeTransport.execute(request)
}

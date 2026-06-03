import { executeClickHouseRequest } from './transport'
import type { ConnectionParams } from './types'

export class ClickHouseError extends Error {
  statusCode: number
  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'ClickHouseError'
    this.statusCode = statusCode
  }
}

export async function query<T>(params: ConnectionParams, sql: string): Promise<T[]> {
  let response: Awaited<ReturnType<typeof executeClickHouseRequest>>
  try {
    response = await executeClickHouseRequest({ params, sql, format: 'JSONEachRow' })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new ClickHouseError(
        `Network error: Cannot reach ${params.host}:${params.port}. Check that ClickHouse is running and CORS is configured (add <allow_origin>*</allow_origin> to config.xml).`,
        0,
      )
    }
    throw err
  }

  const body = response.body

  if (!response.ok) {
    const message = body.trim() || `HTTP ${response.status}`
    throw new ClickHouseError(message, response.status)
  }

  if (!body.trim()) return []

  return body
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as T)
}

export async function ping(params: ConnectionParams): Promise<void> {
  await query(params, 'SELECT 1')
}

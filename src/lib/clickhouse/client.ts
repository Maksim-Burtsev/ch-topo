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
  const url = `http://${params.host}:${params.port}/`

  const headers: Record<string, string> = {
    'X-ClickHouse-User': params.user,
    'X-ClickHouse-Database': params.database,
  }
  if (params.password) {
    headers['X-ClickHouse-Key'] = params.password
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: `${sql} FORMAT JSONEachRow`,
    })
  } catch (err) {
    if (err instanceof TypeError) {
      throw new ClickHouseError(
        `Network error: Cannot reach ${params.host}:${params.port}. Check that ClickHouse is running and CORS is configured (add <allow_origin>*</allow_origin> to config.xml).`,
        0,
      )
    }
    throw err
  }

  const body = await response.text()

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

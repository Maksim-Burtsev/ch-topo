import type {
  BackendClickHouseConnection,
  BackendClickHouseRequest,
  BackendClickHouseResponse,
} from './types.js'

const DEFAULT_TIMEOUT_MS = 30_000

export class BackendClickHouseError extends Error {
  statusCode: number
  code?: string

  constructor(message: string, statusCode: number, code?: string) {
    super(message)
    this.name = 'BackendClickHouseError'
    this.statusCode = statusCode
    this.code = code
  }
}

function buildUrl(connection: BackendClickHouseConnection) {
  return `http://${connection.host}:${connection.port}/`
}

function buildHeaders(connection: BackendClickHouseConnection): Record<string, string> {
  const headers: Record<string, string> = {
    'X-ClickHouse-Database': connection.database,
    'X-ClickHouse-User': connection.user,
  }

  if (connection.password) {
    headers['X-ClickHouse-Key'] = connection.password
  }

  return headers
}

function buildBody({ sql, format }: BackendClickHouseRequest) {
  if (!format) return sql
  return `${sql} FORMAT ${format}`
}

function extractClickHouseCode(message: string) {
  return message.match(/^Code:\s*(\d+)/)?.[1]
}

function isAbortError(err: unknown) {
  return err instanceof Error && err.name === 'AbortError'
}

export async function executeClickHouseRequest(
  request: BackendClickHouseRequest,
): Promise<BackendClickHouseResponse> {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()

  if (request.signal?.aborted) {
    throw new BackendClickHouseError('ClickHouse query cancelled', 0)
  }

  const abortFromCaller = () => {
    controller.abort()
  }

  request.signal?.addEventListener('abort', abortFromCaller, { once: true })

  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(buildUrl(request.connection), {
      method: 'POST',
      headers: buildHeaders(request.connection),
      body: buildBody(request),
      signal: controller.signal,
    })
    const body = await response.text()

    if (!response.ok) {
      const message = body.trim() || `HTTP ${response.status}`
      throw new BackendClickHouseError(message, response.status, extractClickHouseCode(message))
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
    }
  } catch (err) {
    if (request.signal?.aborted) {
      throw new BackendClickHouseError('ClickHouse query cancelled', 0)
    }

    if (controller.signal.aborted || isAbortError(err)) {
      throw new BackendClickHouseError(`ClickHouse query timed out after ${timeoutMs}ms`, 0)
    }

    if (err instanceof TypeError) {
      throw new BackendClickHouseError(
        `Network error: Cannot reach ${request.connection.host}:${request.connection.port}`,
        0,
      )
    }

    throw err
  } finally {
    clearTimeout(timeoutId)
    request.signal?.removeEventListener('abort', abortFromCaller)
  }
}

export async function queryClickHouseRows<T>(
  request: Omit<BackendClickHouseRequest, 'format'>,
): Promise<T[]> {
  const response = await executeClickHouseRequest({
    ...request,
    format: 'JSONEachRow',
  })

  if (!response.body.trim()) return []

  return response.body
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as T)
}

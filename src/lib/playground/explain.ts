import { executeClickHouseRequest } from '@/lib/clickhouse/transport'
import type { ConnectionParams } from '@/lib/clickhouse/types'

// ── Types ──────────────────────────────────────────────────────

export type ExplainMode = 'plan' | 'pipeline' | 'syntax'

export interface ExplainResult {
  mode: ExplainMode
  text: string
  error?: string
  sessionExpired?: boolean
}

export interface ExplainOptions {
  timeoutMs?: number
  signal?: AbortSignal
  connectionMode?: 'direct' | 'server' | 'demo'
}

const DEFAULT_TIMEOUT_MS = 30_000

const EXPLAIN_PREFIX: Record<ExplainMode, string> = {
  plan: 'EXPLAIN PLAN',
  pipeline: 'EXPLAIN PIPELINE',
  syntax: 'EXPLAIN SYNTAX',
}

interface ExplainApiErrorBody {
  error?: unknown
}

interface ExplainApiErrorPayload {
  message?: unknown
}

// ── Build explain query ────────────────────────────────────────

export function buildExplainQuery(sql: string, mode: ExplainMode): string {
  const trimmed = sql.trim().replace(/\s*;+\s*$/, '')
  return `${EXPLAIN_PREFIX[mode]} ${trimmed}`
}

function isExplainApiErrorPayload(value: unknown): value is ExplainApiErrorPayload {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function readServerExplainError(response: Response): Promise<{
  message: string
  sessionExpired: boolean
}> {
  if (response.status === 401) {
    return {
      message: 'Server session expired. Reconnect to ClickHouse and run EXPLAIN again.',
      sessionExpired: true,
    }
  }

  try {
    const body = (await response.json()) as ExplainApiErrorBody
    const error = body.error

    if (isExplainApiErrorPayload(error) && typeof error.message === 'string') {
      return { message: error.message, sessionExpired: false }
    }

    if (typeof error === 'string' && error.trim()) {
      return { message: error, sessionExpired: false }
    }
  } catch {
    // Fall back to HTTP status below.
  }

  return { message: `HTTP ${response.status}`, sessionExpired: false }
}

async function explainServerQuery(
  sql: string,
  mode: ExplainMode,
  options?: ExplainOptions,
): Promise<ExplainResult> {
  let response: Response

  try {
    response = await fetch('/api/explain', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sql,
        mode,
        timeoutMs: options?.timeoutMs,
      }),
      signal: options?.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { mode, text: '', error: 'Query cancelled' }
    }

    if (err instanceof TypeError) {
      return {
        mode,
        text: '',
        error:
          'Network error: Cannot reach the ch-topo API. Check that the local API server is running.',
      }
    }

    return {
      mode,
      text: '',
      error: err instanceof Error ? err.message : 'Failed to explain query',
    }
  }

  if (!response.ok) {
    const error = await readServerExplainError(response)
    return {
      mode,
      text: '',
      error: error.message,
      sessionExpired: error.sessionExpired,
    }
  }

  return (await response.json()) as ExplainResult
}

// ── Execute explain ────────────────────────────────────────────

export async function explainQuery(
  sql: string,
  params: ConnectionParams,
  mode: ExplainMode = 'plan',
  options?: ExplainOptions,
): Promise<ExplainResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (options?.connectionMode === 'demo') {
    return {
      mode,
      text: '',
      error: 'Demo Mode cannot run EXPLAIN. Connect to ClickHouse to inspect real query plans.',
    }
  }

  if (options?.connectionMode === 'server') {
    return explainServerQuery(sql, mode, options)
  }

  const controller = new AbortController()

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

  const explainSql = buildExplainQuery(sql, mode)

  try {
    const response = await executeClickHouseRequest({
      params,
      sql: explainSql,
      signal: controller.signal,
    })

    const body = response.body

    if (!response.ok) {
      return {
        mode,
        text: '',
        error: body.trim() || `HTTP ${response.status}`,
      }
    }

    return {
      mode,
      text: body,
    }
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      const reason =
        controller.signal.reason instanceof DOMException &&
        controller.signal.reason.name === 'TimeoutError'
          ? `Query timed out after ${timeoutMs}ms`
          : 'Query cancelled'
      return { mode, text: '', error: reason }
    }

    if (err instanceof TypeError) {
      return {
        mode,
        text: '',
        error: `Network error: Cannot reach ${params.host}:${params.port}. Check that ClickHouse is running and CORS is configured.`,
      }
    }

    const message = err instanceof Error ? err.message : 'Unknown error'
    return { mode, text: '', error: message }
  } finally {
    clearTimeout(timeoutId)
  }
}

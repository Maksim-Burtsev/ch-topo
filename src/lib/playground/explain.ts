import type { ConnectionParams } from '@/lib/clickhouse/types'

// ── Types ──────────────────────────────────────────────────────

export type ExplainMode = 'plan' | 'pipeline' | 'syntax'

export interface ExplainResult {
  mode: ExplainMode
  text: string
  error?: string
}

export interface ExplainOptions {
  timeoutMs?: number
  signal?: AbortSignal
}

const DEFAULT_TIMEOUT_MS = 30_000

const EXPLAIN_PREFIX: Record<ExplainMode, string> = {
  plan: 'EXPLAIN PLAN',
  pipeline: 'EXPLAIN PIPELINE',
  syntax: 'EXPLAIN SYNTAX',
}

// ── Build explain query ────────────────────────────────────────

export function buildExplainQuery(sql: string, mode: ExplainMode): string {
  const trimmed = sql.trim().replace(/\s*;+\s*$/, '')
  return `${EXPLAIN_PREFIX[mode]} ${trimmed}`
}

// ── Execute explain ────────────────────────────────────────────

export async function explainQuery(
  sql: string,
  params: ConnectionParams,
  mode: ExplainMode = 'plan',
  options?: ExplainOptions,
): Promise<ExplainResult> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS

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

  const url = `http://${params.host}:${params.port}/`

  const headers: Record<string, string> = {
    'X-ClickHouse-User': params.user,
    'X-ClickHouse-Database': params.database,
  }
  if (params.password) {
    headers['X-ClickHouse-Key'] = params.password
  }

  const explainSql = buildExplainQuery(sql, mode)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: explainSql,
      signal: controller.signal,
    })

    const body = await response.text()

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

import type { BackendClickHouseConnection } from '../clickhouse/types.js'
import { normalizeQueryError } from '../query/service.js'
import type { ClickHouseExecute } from '../query/types.js'
import type { ExplainMode, ExplainRequestPayload, ExplainResult } from './types.js'

const DEFAULT_TIMEOUT_MS = 30_000

const EXPLAIN_PREFIX: Record<ExplainMode, string> = {
  plan: 'EXPLAIN PLAN',
  pipeline: 'EXPLAIN PIPELINE',
  syntax: 'EXPLAIN SYNTAX',
}

function trimTrailingSemicolons(sql: string) {
  return sql.trim().replace(/[;\s]+$/u, '')
}

function timeoutMs(value: number | undefined) {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : DEFAULT_TIMEOUT_MS
}

function buildExplainSql(payload: ExplainRequestPayload) {
  const mode = payload.mode ?? 'plan'
  return `${EXPLAIN_PREFIX[mode]} ${trimTrailingSemicolons(payload.sql)}`
}

export async function explainQuery(
  connection: BackendClickHouseConnection,
  payload: ExplainRequestPayload,
  execute: ClickHouseExecute,
  signal?: AbortSignal,
): Promise<ExplainResult> {
  const mode = payload.mode ?? 'plan'

  try {
    const response = await execute({
      connection,
      sql: buildExplainSql(payload),
      timeoutMs: timeoutMs(payload.timeoutMs),
      signal,
    })

    return {
      mode,
      text: response.body,
    }
  } catch (err) {
    throw normalizeQueryError(err)
  }
}

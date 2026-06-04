import type { BackendClickHouseConnection } from '../clickhouse/types.js'
import type { HistoryQueryRows, RawDDLHistoryRow } from './types.js'

export const HISTORY_SQL = `SELECT event_time, query, type, exception, query_duration_ms, user, initial_user, query_kind, current_database
FROM system.query_log
WHERE query_kind IN ('Create', 'Alter', 'Drop', 'Rename')
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing', 'ExceptionBeforeStart')
ORDER BY event_time DESC
LIMIT 200`

export class HistoryLoadError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'HistoryLoadError'
    this.statusCode = statusCode
  }
}

function normalizeHistoryError(err: unknown): HistoryLoadError {
  const message = err instanceof Error ? err.message : String(err)
  const lower = message.toLowerCase()

  if (
    lower.includes('access_denied') ||
    lower.includes('not enough privileges') ||
    lower.includes('not enough rights') ||
    lower.includes('permission')
  ) {
    return new HistoryLoadError('DDL history requires SELECT permission on system.query_log.', 403)
  }

  if (
    lower.includes('system.query_log') &&
    (lower.includes('does not exist') ||
      lower.includes('unknown table') ||
      lower.includes('not enabled') ||
      lower.includes('disabled'))
  ) {
    return new HistoryLoadError(
      'ClickHouse system.query_log is not enabled or has no table yet.',
      424,
    )
  }

  return new HistoryLoadError(message, 502)
}

export async function loadHistory(
  connection: BackendClickHouseConnection,
  queryRows: HistoryQueryRows,
): Promise<RawDDLHistoryRow[]> {
  try {
    return await queryRows<RawDDLHistoryRow>({
      connection,
      sql: HISTORY_SQL,
    })
  } catch (err) {
    throw normalizeHistoryError(err)
  }
}

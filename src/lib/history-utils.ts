import type { RawDDLHistoryRow } from '@/lib/clickhouse/types'

/** Resolve the author of a DDL history entry: initial_user > user > 'system'. */
export function getAuthor(entry: RawDDLHistoryRow): string {
  const user = entry.initial_user || entry.user
  return user || 'system'
}

/** Map a DDL operation kind to a badge variant. */
export function getOperationVariant(op: string): 'mergetree' | 'replacing' | 'destructive' | 'mv' {
  switch (op) {
    case 'Create':
      return 'mergetree'
    case 'Alter':
      return 'replacing'
    case 'Drop':
      return 'destructive'
    case 'Rename':
      return 'mv'
    default:
      return 'mergetree'
  }
}

/** Parse a ClickHouse event_time string (space-separated) into a Date. */
export function parseEventDate(eventTime: string): Date {
  return new Date(eventTime.replace(' ', 'T'))
}

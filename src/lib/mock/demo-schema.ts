import type {
  RawColumnRow,
  RawDDLHistoryRow,
  RawDictionaryRow,
  RawGrantRow,
  RawIndexRow,
  RawRowPolicyRow,
  RawTableRow,
} from '@/lib/clickhouse/types'
import { mockColumns, mockDDLHistory, mockDictionaries, mockTables } from './data'

export interface DemoSchemaPayload {
  tables: RawTableRow[]
  columns: RawColumnRow[]
  indices: RawIndexRow[]
  dictionaries: RawDictionaryRow[]
  rowPolicies: RawRowPolicyRow[]
  grants: RawGrantRow[]
  warnings: []
}

export const demoConnectionParams = {
  host: 'demo',
  port: 0,
  database: 'demo',
  user: 'demo',
  password: '',
}

export function getDemoSchema(): DemoSchemaPayload {
  return {
    tables: mockTables.map((table) => ({
      database: table.database,
      name: table.name,
      engine: table.engine,
      total_rows: String(table.total_rows),
      total_bytes: String(table.total_bytes),
      data_compressed_bytes: String(table.compressed_bytes),
      create_table_query: table.create_table_query,
      sorting_key: table.sorting_key,
      partition_key: table.partition_key,
      metadata_modification_time: table.metadata_modification_time,
    })),
    columns: mockColumns,
    indices: [],
    dictionaries: mockDictionaries,
    rowPolicies: [],
    grants: [
      {
        user_name: '',
        role_name: 'analyst_role',
        database: 'analytics',
        table: 'events',
        column: 'user_id',
        grant_option: 0,
      },
    ],
    warnings: [],
  }
}

export function getDemoHistory(): RawDDLHistoryRow[] {
  return mockDDLHistory.map((entry) => ({
    event_time: entry.timestamp,
    query: entry.query,
    type: entry.status === 'applied' ? 'QueryFinish' : 'ExceptionWhileProcessing',
    exception: entry.status === 'failed' ? 'Demo failure: dependency check blocked the DDL.' : '',
    query_duration_ms: String(entry.duration_ms),
    user: entry.user,
    initial_user: entry.user,
    query_kind: entry.query.trim().split(/\s+/u)[0] ?? '',
    current_database: 'analytics',
  }))
}

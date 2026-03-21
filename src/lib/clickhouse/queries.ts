import { query } from './client'
import type {
  ConnectionParams,
  RawTableRow,
  RawColumnRow,
  RawIndexRow,
  RawDictionaryRow,
  RawRowPolicyRow,
  RawGrantRow,
} from './types'

const EXCLUDED_DBS = `('system', 'INFORMATION_SCHEMA', 'information_schema')`

export function fetchTables(params: ConnectionParams) {
  return query<RawTableRow>(
    params,
    `SELECT database, name, engine, total_rows, total_bytes,
       create_table_query, sorting_key, partition_key,
       metadata_modification_time
FROM system.tables
WHERE database NOT IN ${EXCLUDED_DBS}`,
  )
}

export function fetchColumns(params: ConnectionParams) {
  return query<RawColumnRow>(
    params,
    `SELECT database, table, name, type, default_kind,
       default_expression, compression_codec
FROM system.columns
WHERE database NOT IN ${EXCLUDED_DBS}`,
  )
}

export function fetchIndices(params: ConnectionParams) {
  return query<RawIndexRow>(
    params,
    `SELECT database, table, name, expr, type
FROM system.data_skipping_indices
WHERE database NOT IN ${EXCLUDED_DBS}`,
  )
}

export function fetchDictionaries(params: ConnectionParams) {
  return query<RawDictionaryRow>(
    params,
    `SELECT name, database, source, structure
FROM system.dictionaries`,
  )
}

export function fetchRowPolicies(params: ConnectionParams) {
  return query<RawRowPolicyRow>(
    params,
    `SELECT name, short_name, database, table, select_filter
FROM system.row_policies`,
  )
}

export function fetchGrants(params: ConnectionParams) {
  return query<RawGrantRow>(
    params,
    `SELECT user_name, role_name, database, table, column, grant_option
FROM system.grants
WHERE column != ''`,
  )
}

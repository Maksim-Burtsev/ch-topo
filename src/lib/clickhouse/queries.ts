import { query } from './client'
import type {
  ConnectionParams,
  RawColumnRow,
  RawDDLHistoryRow,
  RawDictionaryRow,
  RawGrantRow,
  RawIndexRow,
  RawRowPolicyRow,
  RawTableRow,
} from './types'

const EXCLUDED_DBS = `('system', 'INFORMATION_SCHEMA', 'information_schema')`

export function fetchTables(params: ConnectionParams) {
  return query<RawTableRow>(
    params,
    `SELECT database, name, engine, total_rows, total_bytes,
       total_bytes AS data_compressed_bytes,
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
    `SELECT name, database, source,
       concat('key: ', arrayStringConcat(arrayMap((n, t) -> concat(n, ' ', t), \`key.names\`, \`key.types\`), ', '),
              ', attributes: ', arrayStringConcat(arrayMap((n, t) -> concat(n, ' ', t), \`attribute.names\`, \`attribute.types\`), ', ')) AS structure,
       bytes_allocated,
       \`key.names\` AS key_names,
       \`key.types\` AS key_types,
       \`attribute.names\` AS attribute_names,
       \`attribute.types\` AS attribute_types
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
    `SELECT ifNull(user_name, '') AS user_name, ifNull(role_name, '') AS role_name,
       database, table, column, grant_option
FROM system.grants
WHERE column <> ''`,
  )
}

export function fetchDDLHistory(params: ConnectionParams) {
  return query<RawDDLHistoryRow>(
    params,
    `SELECT event_time, query, type, exception, query_duration_ms, user, initial_user, query_kind, current_database
FROM system.query_log
WHERE query_kind IN ('Create', 'Alter', 'Drop', 'Rename')
  AND type IN ('QueryFinish', 'ExceptionWhileProcessing', 'ExceptionBeforeStart')
ORDER BY event_time DESC
LIMIT 200`,
  )
}

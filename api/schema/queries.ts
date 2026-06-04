const EXCLUDED_DBS = `('system', 'INFORMATION_SCHEMA', 'information_schema')`

export const TABLES_SQL = `SELECT database, name, engine, total_rows, total_bytes,
       total_bytes AS data_compressed_bytes,
       create_table_query, sorting_key, partition_key,
       metadata_modification_time
FROM system.tables
WHERE database NOT IN ${EXCLUDED_DBS}`

export const COLUMNS_SQL = `SELECT database, table, name, type, default_kind,
       default_expression, compression_codec,
       data_compressed_bytes, data_uncompressed_bytes
FROM system.columns
WHERE database NOT IN ${EXCLUDED_DBS}`

export const INDICES_SQL = `SELECT database, table, name, expr, type
FROM system.data_skipping_indices
WHERE database NOT IN ${EXCLUDED_DBS}`

export const DICTIONARIES_SQL = `SELECT name, database, source,
       concat('key: ', arrayStringConcat(arrayMap((n, t) -> concat(n, ' ', t), \`key.names\`, \`key.types\`), ', '),
              ', attributes: ', arrayStringConcat(arrayMap((n, t) -> concat(n, ' ', t), \`attribute.names\`, \`attribute.types\`), ', ')) AS structure,
       bytes_allocated,
       \`key.names\` AS key_names,
       \`key.types\` AS key_types,
       \`attribute.names\` AS attribute_names,
       \`attribute.types\` AS attribute_types
FROM system.dictionaries`

export const ROW_POLICIES_SQL = `SELECT name, short_name, database, table, select_filter
FROM system.row_policies`

export const GRANTS_SQL = `SELECT ifNull(user_name, '') AS user_name, ifNull(role_name, '') AS role_name,
       database, table, column, grant_option
FROM system.grants
WHERE column <> ''`

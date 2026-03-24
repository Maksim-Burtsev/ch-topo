export interface ConnectionParams {
  host: string
  port: number
  database: string
  user: string
  password: string
}

export interface RawTableRow {
  database: string
  name: string
  engine: string
  total_rows: string
  total_bytes: string
  data_compressed_bytes: string
  create_table_query: string
  sorting_key: string
  partition_key: string
  metadata_modification_time: string
}

export interface RawDDLHistoryRow {
  event_time: string
  query: string
  type: string
  exception: string
  query_duration_ms: string
  user: string
  initial_user: string
  query_kind: string
  current_database: string
}

export interface RawColumnRow {
  database: string
  table: string
  name: string
  type: string
  default_kind: string
  default_expression: string
  compression_codec: string
}

export interface RawIndexRow {
  database: string
  table: string
  name: string
  expr: string
  type: string
}

export interface RawDictionaryRow {
  name: string
  database: string
  source: string
  structure: string
}

export interface RawRowPolicyRow {
  name: string
  short_name: string
  database: string
  table: string
  select_filter: string
}

export interface RawGrantRow {
  user_name: string
  role_name: string
  database: string
  table: string
  column: string
  grant_option: number
}

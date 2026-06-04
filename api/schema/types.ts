import type { BackendClickHouseConnection } from '../clickhouse/types.js'

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

export interface RawColumnRow {
  database: string
  table: string
  name: string
  type: string
  default_kind: string
  default_expression: string
  compression_codec: string
  data_compressed_bytes: string
  data_uncompressed_bytes: string
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
  bytes_allocated: string
  key_names: string[]
  key_types: string[]
  attribute_names: string[]
  attribute_types: string[]
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

export interface SchemaPayload {
  tables: RawTableRow[]
  columns: RawColumnRow[]
  indices: RawIndexRow[]
  dictionaries: RawDictionaryRow[]
  rowPolicies: RawRowPolicyRow[]
  grants: RawGrantRow[]
  warnings: SchemaWarning[]
}

export interface SchemaWarning {
  source: 'indices' | 'dictionaries' | 'rowPolicies' | 'grants'
  message: string
}

export interface SchemaQueryRequest {
  connection: BackendClickHouseConnection
  sql: string
  timeoutMs?: number
}

export type SchemaQueryRows = <T>(request: SchemaQueryRequest) => Promise<T[]>

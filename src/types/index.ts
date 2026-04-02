export interface TableInfo {
  database: string
  name: string
  engine: string
  total_rows: number
  total_bytes: number
  compressed_bytes: number
  create_table_query: string
  sorting_key: string
  partition_key: string
  metadata_modification_time: string
  active_parts: number
}

export interface ColumnInfo {
  database: string
  table: string
  name: string
  type: string
  default_kind: string
  default_expression: string
  compression_codec: string
}

export interface DictionaryInfo {
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

export type ImpactSeverity = 'break' | 'stale' | 'warning'

export interface Impact {
  severity: ImpactSeverity
  objectType: string
  objectName: string
  reason: string
  ddlFragment: string
  column?: string
}

export type DDLAction =
  | { type: 'DROP_COLUMN'; table: string; column: string }
  | { type: 'MODIFY_COLUMN'; table: string; column: string; newType: string }
  | { type: 'RENAME_COLUMN'; table: string; oldName: string; newName: string }
  | { type: 'DROP_TABLE'; table: string }

export interface DDLHistoryEntry {
  timestamp: string
  query: string
  status: 'applied' | 'failed'
  duration_ms: number
  user: string
}

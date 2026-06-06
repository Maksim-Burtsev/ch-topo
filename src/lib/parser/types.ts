export interface ColumnReference {
  column: string
  sourceTable?: string
  context: 'select' | 'where' | 'group_by' | 'join' | 'order_by'
}

export interface ParsedTable {
  database: string
  name: string
  engine: string

  // MergeTree fields
  orderByColumns: string[]
  partitionByColumns: string[]
  ttlColumns: string[]
  sampleByColumn: string | null
  projectionColumns: Record<string, string[]>
  settings: Record<string, string>

  // MV fields
  sourceTable: string | null
  sourceTables: string[]
  targetTable: string | null
  referencedColumns: ColumnReference[]
  selectStarSources: Array<string | null>

  // Flags
  selectsAll: boolean
}

export function emptyParsedTable(): ParsedTable {
  return {
    database: '',
    name: '',
    engine: '',
    orderByColumns: [],
    partitionByColumns: [],
    ttlColumns: [],
    sampleByColumn: null,
    projectionColumns: {},
    settings: {},
    sourceTable: null,
    sourceTables: [],
    targetTable: null,
    referencedColumns: [],
    selectStarSources: [],
    selectsAll: false,
  }
}

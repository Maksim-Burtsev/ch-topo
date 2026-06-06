import type { RawColumnRow, RawTableRow } from './clickhouse/types'

export const SCHEMA_SNAPSHOT_STORAGE_KEY = 'chtopo_schema_snapshot_v1'

export interface SchemaSnapshotTable {
  database: string
  name: string
  engine: string
  sortingKey: string
  partitionKey: string
}

export interface SchemaSnapshotColumn {
  database: string
  table: string
  name: string
  type: string
  defaultKind: string
  defaultExpression: string
  compressionCodec: string
}

export interface SchemaSnapshot {
  version: 1
  createdAt: string
  tables: SchemaSnapshotTable[]
  columns: SchemaSnapshotColumn[]
}

export interface SchemaDiffItem {
  name: string
}

export interface SchemaDiffChange {
  field: string
  before: string
  after: string
}

export interface SchemaDiffChangedItem {
  name: string
  changes: SchemaDiffChange[]
}

export interface SchemaDiff {
  addedTables: SchemaDiffItem[]
  removedTables: SchemaDiffItem[]
  changedTables: SchemaDiffChangedItem[]
  addedColumns: SchemaDiffItem[]
  removedColumns: SchemaDiffItem[]
  changedColumns: SchemaDiffChangedItem[]
}

interface BuildSchemaSnapshotInput {
  tables: RawTableRow[]
  columns: RawColumnRow[]
  createdAt?: string
}

function tableKey(table: Pick<SchemaSnapshotTable, 'database' | 'name'>): string {
  return `${table.database}.${table.name}`
}

function columnKey(column: Pick<SchemaSnapshotColumn, 'database' | 'table' | 'name'>): string {
  return `${column.database}.${column.table}.${column.name}`
}

function byName(a: SchemaDiffItem, b: SchemaDiffItem): number {
  return a.name.localeCompare(b.name)
}

function stringField(value: object, field: string): string {
  const fieldValue = (value as Record<string, unknown>)[field]
  return typeof fieldValue === 'string' ? fieldValue : ''
}

function compareFields(before: object, after: object, fields: string[]): SchemaDiffChange[] {
  return fields.flatMap((field) => {
    const beforeValue = stringField(before, field)
    const afterValue = stringField(after, field)
    return beforeValue === afterValue ? [] : [{ field, before: beforeValue, after: afterValue }]
  })
}

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function isSnapshot(value: unknown): value is SchemaSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const snapshot = value as Partial<SchemaSnapshot>
  return (
    snapshot.version === 1 &&
    typeof snapshot.createdAt === 'string' &&
    Array.isArray(snapshot.tables) &&
    Array.isArray(snapshot.columns)
  )
}

export function buildSchemaSnapshot(input: BuildSchemaSnapshotInput): SchemaSnapshot {
  return {
    version: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
    tables: input.tables
      .map((table) => ({
        database: table.database,
        name: table.name,
        engine: table.engine,
        sortingKey: table.sorting_key,
        partitionKey: table.partition_key,
      }))
      .sort((a, b) => tableKey(a).localeCompare(tableKey(b))),
    columns: input.columns
      .map((column) => ({
        database: column.database,
        table: column.table,
        name: column.name,
        type: column.type,
        defaultKind: column.default_kind,
        defaultExpression: column.default_expression,
        compressionCodec: column.compression_codec,
      }))
      .sort((a, b) => columnKey(a).localeCompare(columnKey(b))),
  }
}

export function buildSchemaDiff(previous: SchemaSnapshot, current: SchemaSnapshot): SchemaDiff {
  const previousTables = new Map(previous.tables.map((table) => [tableKey(table), table]))
  const currentTables = new Map(current.tables.map((table) => [tableKey(table), table]))
  const previousColumns = new Map(previous.columns.map((column) => [columnKey(column), column]))
  const currentColumns = new Map(current.columns.map((column) => [columnKey(column), column]))

  const addedTables = [...currentTables.keys()]
    .filter((name) => !previousTables.has(name))
    .map((name) => ({ name }))
    .sort(byName)
  const removedTables = [...previousTables.keys()]
    .filter((name) => !currentTables.has(name))
    .map((name) => ({ name }))
    .sort(byName)
  const addedColumns = [...currentColumns.keys()]
    .filter((name) => !previousColumns.has(name))
    .map((name) => ({ name }))
    .sort(byName)
  const removedColumns = [...previousColumns.keys()]
    .filter((name) => !currentColumns.has(name))
    .map((name) => ({ name }))
    .sort(byName)

  const changedTables = [...currentTables.entries()]
    .flatMap(([name, currentTable]) => {
      const previousTable = previousTables.get(name)
      if (!previousTable) return []
      const changes = compareFields(previousTable, currentTable, [
        'engine',
        'sortingKey',
        'partitionKey',
      ])
      return changes.length > 0 ? [{ name, changes }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const changedColumns = [...currentColumns.entries()]
    .flatMap(([name, currentColumn]) => {
      const previousColumn = previousColumns.get(name)
      if (!previousColumn) return []
      const changes = compareFields(previousColumn, currentColumn, [
        'type',
        'defaultKind',
        'defaultExpression',
        'compressionCodec',
      ])
      return changes.length > 0 ? [{ name, changes }] : []
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    addedTables,
    removedTables,
    changedTables,
    addedColumns,
    removedColumns,
    changedColumns,
  }
}

export function saveSchemaSnapshot(snapshot: SchemaSnapshot): boolean {
  const storage = getStorage()
  if (!storage) return false
  storage.setItem(SCHEMA_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot))
  return true
}

export function loadSchemaSnapshot(): SchemaSnapshot | null {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(SCHEMA_SNAPSHOT_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    return isSnapshot(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function clearSchemaSnapshot(): void {
  getStorage()?.removeItem(SCHEMA_SNAPSHOT_STORAGE_KEY)
}

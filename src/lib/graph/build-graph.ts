import type {
  RawColumnRow,
  RawDictionaryRow,
  RawGrantRow,
  RawIndexRow,
  RawRowPolicyRow,
  RawTableRow,
} from '@/lib/clickhouse/types'
import { parseDDL } from '@/lib/parser/ddl-parser'
import { extractColumnRefs } from '@/lib/parser/extract-columns'
import { emptyDependencyGraph } from './types'
import type { DependencyGraph, DictDependency, MVReference } from './types'

function fqn(db: string, name: string): string {
  return db ? `${db}.${name}` : name
}

function addColumnToMVRef(map: Map<string, MVReference[]>, colKey: string, ref: MVReference): void {
  const existing = map.get(colKey)
  if (existing) {
    existing.push(ref)
  } else {
    map.set(colKey, [ref])
  }
}

function getMVSourceTables(parsed: {
  sourceTable: string | null
  sourceTables: string[]
}): string[] {
  if (parsed.sourceTables.length > 0) return parsed.sourceTables
  return parsed.sourceTable ? [parsed.sourceTable] : []
}

function getMVKnownColumns(
  sourceTables: string[],
  columnsByTable: Map<string, Set<string>>,
): Set<string> {
  const knownColumns = new Set<string>()
  for (const sourceTable of sourceTables) {
    const sourceColumns = columnsByTable.get(sourceTable)
    if (!sourceColumns) continue

    for (const column of sourceColumns) {
      knownColumns.add(column)
    }
  }
  return knownColumns
}

function getMVColumnsByTable(
  sourceTables: string[],
  columnsByTable: Map<string, Set<string>>,
): Map<string, Set<string>> {
  const mvColumnsByTable = new Map<string, Set<string>>()
  for (const sourceTable of sourceTables) {
    mvColumnsByTable.set(sourceTable, columnsByTable.get(sourceTable) ?? new Set<string>())
  }
  return mvColumnsByTable
}

function getReferenceSourceTables(
  column: string,
  explicitSourceTable: string | undefined,
  sourceTables: string[],
  columnsByTable: Map<string, Set<string>>,
): string[] {
  if (explicitSourceTable) return [explicitSourceTable]
  if (sourceTables.length === 1) return [sourceTables[0] ?? '']

  return sourceTables.filter((sourceTable) => columnsByTable.get(sourceTable)?.has(column))
}

function getSelectStarSourceTables(starSource: string | null, sourceTables: string[]): string[] {
  return starSource ? [starSource] : sourceTables
}

function splitEngineArgs(args: string): string[] {
  const result: string[] = []
  let current = ''
  let depth = 0
  let quote: string | null = null

  for (let i = 0; i < args.length; i++) {
    const ch = args[i]
    if (ch === undefined) continue

    if (quote) {
      current += ch
      const next = args[i + 1]
      if (next && ch === quote && next === quote) {
        current += next
        i++
      } else if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      current += ch
      continue
    }

    if (ch === '(') {
      depth++
      current += ch
      continue
    }

    if (ch === ')') {
      depth--
      current += ch
      continue
    }

    if (ch === ',' && depth === 0) {
      const trimmed = current.trim()
      if (trimmed) result.push(trimmed)
      current = ''
      continue
    }

    current += ch
  }

  const trimmed = current.trim()
  if (trimmed) result.push(trimmed)
  return result
}

function extractEngineArgs(ddl: string, engineName: string): string[] {
  const match = new RegExp(`\\b${engineName}\\s*\\(`, 'i').exec(ddl)
  if (!match) return []

  const start = match.index + match[0].length
  let depth = 1
  let quote: string | null = null

  for (let i = start; i < ddl.length; i++) {
    const ch = ddl[i]

    if (quote) {
      if (ch === quote && ddl[i + 1] === quote) {
        i++
      } else if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }

    if (ch === '(') depth++
    if (ch === ')') {
      depth--
      if (depth === 0) return splitEngineArgs(ddl.slice(start, i))
    }
  }

  return []
}

function normalizeEngineIdentifier(value: string, fallbackDatabase?: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^currentDatabase\s*\(\s*\)$/i.test(trimmed)) return fallbackDatabase ?? null
  if (/^['"`].*['"`]$/.test(trimmed)) {
    return trimmed.slice(1, -1).replaceAll('``', '`').replaceAll("''", "'").replaceAll('""', '"')
  }
  if (/^[A-Za-z_][\w$-]*$/.test(trimmed)) return trimmed
  return null
}

function parseDistributedEngine(ddl: string, tableDatabase: string): string | null {
  // ENGINE = Distributed(cluster, db, table[, sharding_key])
  const args = extractEngineArgs(ddl, 'Distributed')
  const db = args[1] ? normalizeEngineIdentifier(args[1], tableDatabase) : null
  const table = args[2] ? normalizeEngineIdentifier(args[2]) : null
  return table ? fqn(db ?? '', table) : null
}

function parseBufferEngine(ddl: string, tableDatabase: string): string | null {
  // ENGINE = Buffer(db, table, layers, ...)
  const args = extractEngineArgs(ddl, 'Buffer')
  const db = args[0] ? normalizeEngineIdentifier(args[0], tableDatabase) : null
  const table = args[1] ? normalizeEngineIdentifier(args[1]) : null
  return table ? fqn(db ?? '', table) : null
}

function getDictionarySourceValue(source: string, key: 'db' | 'database' | 'table'): string | null {
  const keyPattern = key === 'database' ? '(?:database)' : key
  const quoted = new RegExp(`\\b${keyPattern}\\b\\s*(?:=\\s*)?['"\`]([^'"\`\\s)]+)['"\`]`, 'i')
  const bare = new RegExp(`\\b${keyPattern}\\b\\s*=\\s*([^\\s)]+)`, 'i')

  return quoted.exec(source)?.[1] ?? bare.exec(source)?.[1] ?? null
}

function getDictionaryKeyColumns(dict: RawDictionaryRow): string[] {
  if (dict.key_names.length > 0) {
    return Array.from(new Set(dict.key_names.filter(Boolean)))
  }

  const keyColumns: string[] = []
  const keySection = /\bkey:\s*(.+?)(?:\battributes:|$)/i.exec(dict.structure)
  if (keySection?.[1]) {
    const keyParts = keySection[1].split(',')
    for (const part of keyParts) {
      const colName = part.trim().split(/\s+/)[0]
      if (colName && !keyColumns.includes(colName)) {
        keyColumns.push(colName)
      }
    }
  }

  return keyColumns
}

function parseDictSource(dict: RawDictionaryRow): DictDependency | null {
  const source = dict.source
  let sourceTable: string | null = null

  // Simple "db.table" format
  const simpleMatch = /^(\w+)\.(\w+)$/.exec(source.trim())
  if (simpleMatch) {
    sourceTable = `${simpleMatch[1]}.${simpleMatch[2]}`
  }

  // ClickHouse(...) format: look for db and table keys
  if (!sourceTable) {
    const db =
      getDictionarySourceValue(source, 'db') ?? getDictionarySourceValue(source, 'database')
    const table = getDictionarySourceValue(source, 'table')
    if (db && table) {
      sourceTable = fqn(db, table)
    } else if (table) {
      sourceTable = table
    }
  }

  if (!sourceTable) return null

  return { sourceTable, keyColumns: getDictionaryKeyColumns(dict) }
}

export function buildDependencyGraph(
  tables: RawTableRow[],
  columns: RawColumnRow[],
  indices: RawIndexRow[],
  dictionaries: RawDictionaryRow[],
  rowPolicies: RawRowPolicyRow[],
  grants: RawGrantRow[],
): DependencyGraph {
  const graph = emptyDependencyGraph()

  // Step 1: Build column lookup per table
  const columnsByTable = new Map<string, Set<string>>()
  for (const col of columns) {
    const key = fqn(col.database, col.table)
    let colSet = columnsByTable.get(key)
    if (!colSet) {
      colSet = new Set()
      columnsByTable.set(key, colSet)
    }
    colSet.add(col.name)
  }

  // Step 1b: Build column type lookup
  for (const col of columns) {
    const colKey = `${fqn(col.database, col.table)}.${col.name}`
    graph.columnTypes.set(colKey, col.type)
  }

  // Step 2: Parse each table DDL and populate graph
  for (const table of tables) {
    const tableKey = fqn(table.database, table.name)

    if (/materializedview/i.test(table.engine)) {
      // For MVs: first extract source tables, then re-parse with source columns.
      const preliminary = parseDDL(table.create_table_query, table.engine)
      const preliminarySources = getMVSourceTables(preliminary)
      const sourceCols = getMVKnownColumns(preliminarySources, columnsByTable)
      const sourceColumnsByTable = getMVColumnsByTable(preliminarySources, columnsByTable)
      const parsed = parseDDL(
        table.create_table_query,
        table.engine,
        sourceCols,
        sourceColumnsByTable,
      )
      const sourceTables = getMVSourceTables(parsed)

      if (sourceTables.length > 0) {
        graph.mvSources.set(tableKey, sourceTables)
      }
      graph.mvTargets.set(tableKey, parsed.targetTable)

      // columnToMVs
      if (parsed.selectStarSources.length > 0 && sourceTables.length > 0) {
        for (const starSource of parsed.selectStarSources) {
          for (const sourceTable of getSelectStarSourceTables(starSource, sourceTables)) {
            const allCols = columnsByTable.get(sourceTable)
            if (allCols) {
              for (const col of allCols) {
                addColumnToMVRef(graph.columnToMVs, `${sourceTable}.${col}`, {
                  mvName: tableKey,
                  usageContext: 'select',
                })
              }
            }
          }
        }
      }

      if (sourceTables.length > 0) {
        for (const ref of parsed.referencedColumns) {
          const refSourceTables = getReferenceSourceTables(
            ref.column,
            ref.sourceTable,
            sourceTables,
            columnsByTable,
          )
          for (const sourceTable of refSourceTables) {
            addColumnToMVRef(graph.columnToMVs, `${sourceTable}.${ref.column}`, {
              mvName: tableKey,
              usageContext: ref.context,
            })
          }
        }
      }
    } else {
      // Non-MV tables: use table's own columns
      const knownCols = columnsByTable.get(tableKey) ?? new Set()
      const parsed = parseDDL(table.create_table_query, table.engine, knownCols)

      if (parsed.orderByColumns.length > 0) {
        graph.orderByColumns.set(tableKey, parsed.orderByColumns)
      }
      if (parsed.partitionByColumns.length > 0) {
        graph.partitionByColumns.set(tableKey, parsed.partitionByColumns)
      }
      if (parsed.ttlColumns.length > 0) {
        graph.ttlExprColumns.set(tableKey, parsed.ttlColumns)
      }
      if (parsed.sampleByColumn) {
        graph.sampleByColumn.set(tableKey, parsed.sampleByColumn)
      }
      for (const [projectionName, projectionColumns] of Object.entries(parsed.projectionColumns)) {
        graph.projectionColumns.set(`${tableKey}.${projectionName}`, projectionColumns)
      }
      for (const [constraintName, constraintColumns] of Object.entries(parsed.constraintColumns)) {
        graph.constraintColumns.set(`${tableKey}.${constraintName}`, constraintColumns)
      }

      // Distributed tables
      if (table.engine === 'Distributed') {
        const localTable = parseDistributedEngine(table.create_table_query, table.database)
        if (localTable) {
          graph.distributedTables.set(tableKey, localTable)
        }
      }

      // Buffer tables
      if (table.engine === 'Buffer') {
        const destTable = parseBufferEngine(table.create_table_query, table.database)
        if (destTable) {
          graph.bufferTables.set(tableKey, destTable)
        }
      }
    }
  }

  // Step 3: Index columns
  for (const idx of indices) {
    const tableKey = fqn(idx.database, idx.table)
    const knownCols = columnsByTable.get(tableKey) ?? new Set()
    const cols = extractColumnRefs(idx.expr, knownCols)
    if (cols.length > 0) {
      graph.indexColumns.set(`${tableKey}.${idx.name}`, cols)
    }
  }

  // Step 4: Default expression deps
  for (const col of columns) {
    if (col.default_kind && col.default_expression) {
      const tableKey = fqn(col.database, col.table)
      const knownCols = columnsByTable.get(tableKey) ?? new Set()
      const deps = extractColumnRefs(col.default_expression, knownCols).filter(
        (d) => d !== col.name,
      )
      if (deps.length > 0) {
        graph.defaultExprDeps.set(`${tableKey}.${col.name}`, deps)
      }
    }
  }

  // Step 5: Dictionary sources
  for (const dict of dictionaries) {
    const dictKey = fqn(dict.database, dict.name)
    const dep = parseDictSource(dict)
    if (dep) {
      graph.dictSources.set(dictKey, dep)
    }
  }

  // Step 6: Column grants
  for (const grant of grants) {
    const colKey = `${fqn(grant.database, grant.table)}.${grant.column}`
    const role = grant.role_name || grant.user_name
    if (role) {
      const existing = graph.columnGrants.get(colKey)
      if (existing) {
        if (!existing.includes(role)) {
          existing.push(role)
        }
      } else {
        graph.columnGrants.set(colKey, [role])
      }
    }
  }

  // Step 7: Row policies
  for (const policy of rowPolicies) {
    const tableKey = fqn(policy.database, policy.table)
    const knownCols = columnsByTable.get(tableKey) ?? new Set()
    const cols = extractColumnRefs(policy.select_filter, knownCols)
    if (cols.length > 0) {
      graph.rowPolicies.set(policy.name, { table: tableKey, columns: cols })
    }
  }

  return graph
}

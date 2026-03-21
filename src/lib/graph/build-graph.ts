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

function parseDistributedEngine(ddl: string): string | null {
  // ENGINE = Distributed(cluster, db, table[, sharding_key])
  const match = /\bDistributed\s*\(\s*'?(\w+)'?\s*,\s*'?(\w+)'?\s*,\s*'?(\w+)'?/i.exec(ddl)
  if (!match) return null
  const db = match[2] ?? ''
  const table = match[3] ?? ''
  return fqn(db, table)
}

function parseBufferEngine(ddl: string): string | null {
  // ENGINE = Buffer(db, table, layers, ...)
  const match = /\bBuffer\s*\(\s*'?(\w+)'?\s*,\s*'?(\w+)'?/i.exec(ddl)
  if (!match) return null
  const db = match[1] ?? ''
  const table = match[2] ?? ''
  return fqn(db, table)
}

function parseDictSource(source: string, structure: string): DictDependency | null {
  let sourceTable: string | null = null

  // Simple "db.table" format
  const simpleMatch = /^(\w+)\.(\w+)$/.exec(source.trim())
  if (simpleMatch) {
    sourceTable = `${simpleMatch[1]}.${simpleMatch[2]}`
  }

  // ClickHouse(...) format: look for db and table keys
  if (!sourceTable) {
    const dbMatch = /\bdb\s*=\s*'?(\w+)'?/i.exec(source)
    const tableMatch = /\btable\s*=\s*'?(\w+)'?/i.exec(source)
    if (dbMatch?.[1] && tableMatch?.[1]) {
      sourceTable = fqn(dbMatch[1], tableMatch[1])
    } else if (tableMatch?.[1]) {
      sourceTable = tableMatch[1]
    }
  }

  if (!sourceTable) return null

  // Extract key columns from structure: "key: col1 Type1, col2 Type2, attributes: ..."
  const keyColumns: string[] = []
  const keySection = /\bkey:\s*(.+?)(?:\battributes:|$)/i.exec(structure)
  if (keySection?.[1]) {
    const keyParts = keySection[1].split(',')
    for (const part of keyParts) {
      const colName = part.trim().split(/\s+/)[0]
      if (colName) {
        keyColumns.push(colName)
      }
    }
  }

  return { sourceTable, keyColumns }
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

  // Step 2: Parse each table DDL and populate graph
  for (const table of tables) {
    const tableKey = fqn(table.database, table.name)

    if (/materializedview/i.test(table.engine)) {
      // For MVs: first extract source table, then re-parse with source columns
      const preliminary = parseDDL(table.create_table_query, table.engine)
      const sourceKey = preliminary.sourceTable
      const sourceCols = sourceKey
        ? (columnsByTable.get(sourceKey) ?? new Set<string>())
        : new Set<string>()
      const parsed = parseDDL(table.create_table_query, table.engine, sourceCols)

      if (parsed.sourceTable) {
        graph.mvSources.set(tableKey, [parsed.sourceTable])
      }
      graph.mvTargets.set(tableKey, parsed.targetTable)

      // columnToMVs
      if (parsed.selectsAll && parsed.sourceTable) {
        // SELECT * — all source columns are referenced
        const allCols = columnsByTable.get(parsed.sourceTable)
        if (allCols) {
          for (const col of allCols) {
            addColumnToMVRef(graph.columnToMVs, `${parsed.sourceTable}.${col}`, {
              mvName: tableKey,
              usageContext: 'select',
            })
          }
        }
      } else if (parsed.sourceTable) {
        for (const ref of parsed.referencedColumns) {
          addColumnToMVRef(graph.columnToMVs, `${parsed.sourceTable}.${ref.column}`, {
            mvName: tableKey,
            usageContext: ref.context,
          })
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

      // Distributed tables
      if (table.engine === 'Distributed') {
        const localTable = parseDistributedEngine(table.create_table_query)
        if (localTable) {
          graph.distributedTables.set(tableKey, localTable)
        }
      }

      // Buffer tables
      if (table.engine === 'Buffer') {
        const destTable = parseBufferEngine(table.create_table_query)
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
    const dep = parseDictSource(dict.source, dict.structure)
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

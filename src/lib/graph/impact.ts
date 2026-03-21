import type { DDLAction, Impact } from '@/types'
import type { DependencyGraph } from './types'

// ─── Type Compatibility ──────────────────────────────────────────────

const UINT_CHAIN = ['UInt8', 'UInt16', 'UInt32', 'UInt64', 'UInt128', 'UInt256']
const INT_CHAIN = ['Int8', 'Int16', 'Int32', 'Int64', 'Int128', 'Int256']
const FLOAT_CHAIN = ['Float32', 'Float64']
const DATE_CHAIN = ['Date', 'Date32', 'DateTime', 'DateTime64']

function stripWrapper(type: string): string {
  const match = /^(?:LowCardinality|Nullable)\((.+)\)$/i.exec(type.trim())
  return match?.[1] ? match[1].trim() : type.trim()
}

function baseType(type: string): string {
  return type.replace(/\(.*\)$/, '')
}

function findInChain(type: string, chain: string[]): number {
  return chain.indexOf(baseType(type))
}

export function isTypeCompatible(oldType: string, newType: string): boolean {
  const old = stripWrapper(oldType)
  const nw = stripWrapper(newType)

  if (old === nw) return true
  if (baseType(old) === baseType(nw)) return true

  // LowCardinality(X) → X or Nullable(X) → X (wrapper removed but inner same)
  if (old !== oldType.trim() || nw !== newType.trim()) {
    return isTypeCompatible(old, nw)
  }

  // Widening within same numeric/date family
  for (const chain of [UINT_CHAIN, INT_CHAIN, FLOAT_CHAIN, DATE_CHAIN]) {
    const oldIdx = findInChain(old, chain)
    const newIdx = findInChain(nw, chain)
    if (oldIdx !== -1 && newIdx !== -1) {
      return newIdx >= oldIdx
    }
  }

  return false
}

// ─── Column-level Impact Check ──────────────────────────────────────

function checkColumnImpacts(
  table: string,
  column: string,
  graph: DependencyGraph,
  isRename: boolean,
): Impact[] {
  const impacts: Impact[] = []
  const colKey = `${table}.${column}`
  const verb = isRename ? 'Renaming' : 'Dropping'

  // ── BREAK: MV references ──
  const mvRefs = graph.columnToMVs.get(colKey)
  const brokenMVs = new Set<string>()

  if (mvRefs) {
    // Group by MV name to avoid duplicates
    const byMV = new Map<string, string[]>()
    for (const ref of mvRefs) {
      const existing = byMV.get(ref.mvName)
      if (existing) {
        if (!existing.includes(ref.usageContext)) existing.push(ref.usageContext)
      } else {
        byMV.set(ref.mvName, [ref.usageContext])
      }
    }

    for (const [mvName, contexts] of byMV) {
      brokenMVs.add(mvName)
      impacts.push({
        severity: 'break',
        objectType: 'mv',
        objectName: mvName,
        reason: `MV references '${column}' in ${contexts.map((c) => c.toUpperCase()).join(', ')} clause. ${verb} will cause INSERT failures.`,
        ddlFragment: `SELECT ... ${column} ... FROM ${table}`,
        column,
      })
    }
  }

  // ── BREAK: ORDER BY ──
  const orderCols = graph.orderByColumns.get(table)
  if (orderCols?.includes(column)) {
    impacts.push({
      severity: 'break',
      objectType: 'order_by',
      objectName: table,
      reason: `Column '${column}' is part of ORDER BY (${orderCols.join(', ')}). Cannot drop a sorting key column.`,
      ddlFragment: `ORDER BY (${orderCols.join(', ')})`,
      column,
    })
  }

  // ── BREAK: PARTITION BY ──
  const partCols = graph.partitionByColumns.get(table)
  if (partCols?.includes(column)) {
    impacts.push({
      severity: 'break',
      objectType: 'partition_by',
      objectName: table,
      reason: `Column '${column}' is used in PARTITION BY. ${verb} will break partitioning.`,
      ddlFragment: `PARTITION BY ... ${column} ...`,
      column,
    })
  }

  // ── BREAK: Dictionary source columns ──
  for (const [dictName, dep] of graph.dictSources) {
    if (dep.sourceTable === table && dep.keyColumns.includes(column)) {
      impacts.push({
        severity: 'break',
        objectType: 'dictionary',
        objectName: dictName,
        reason: `Dictionary source key column '${column}' would be dropped from ${table}.`,
        ddlFragment: `DICTIONARY ${dictName} SOURCE(... ${table} ...)`,
        column,
      })
    }
  }

  // ── STALE: Target tables of broken MVs ──
  const staleTargets = new Set<string>()
  for (const mv of brokenMVs) {
    const target = graph.mvTargets.get(mv)
    if (target && !staleTargets.has(target)) {
      staleTargets.add(target)
      impacts.push({
        severity: 'stale',
        objectType: 'target_table',
        objectName: target,
        reason: `Target table of ${mv} will stop receiving new data if the MV breaks.`,
        ddlFragment: `CREATE MATERIALIZED VIEW ${mv} TO ${target}`,
      })
    }
  }

  // ── STALE: Distributed tables ──
  for (const [distTable, localTable] of graph.distributedTables) {
    if (localTable === table) {
      impacts.push({
        severity: 'stale',
        objectType: 'distributed',
        objectName: distTable,
        reason: `Distributed table schema will mismatch after column '${column}' is removed from ${table}.`,
        ddlFragment: `Distributed(..., ${table})`,
        column,
      })
    }
  }

  // ── STALE: Buffer tables ──
  for (const [bufTable, destTable] of graph.bufferTables) {
    if (destTable === table) {
      impacts.push({
        severity: 'stale',
        objectType: 'buffer',
        objectName: bufTable,
        reason: `Buffer table flush may fail after column '${column}' is removed from ${table}.`,
        ddlFragment: `Buffer(..., ${table})`,
        column,
      })
    }
  }

  // ── WARNING: TTL ──
  const ttlCols = graph.ttlExprColumns.get(table)
  if (ttlCols?.includes(column)) {
    impacts.push({
      severity: 'warning',
      objectType: 'ttl',
      objectName: table,
      reason: `Column '${column}' is used in TTL expression. ${verb} will break TTL cleanup.`,
      ddlFragment: `TTL ... ${column} ...`,
      column,
    })
  }

  // ── WARNING: SAMPLE BY ──
  const sampleCol = graph.sampleByColumn.get(table)
  if (sampleCol === column) {
    impacts.push({
      severity: 'warning',
      objectType: 'sample_by',
      objectName: table,
      reason: `Column '${column}' is referenced in SAMPLE BY. ${verb} will break sampling queries.`,
      ddlFragment: `SAMPLE BY ... ${column} ...`,
      column,
    })
  }

  // ── WARNING: Skip indexes ──
  for (const [idxKey, cols] of graph.indexColumns) {
    if (idxKey.startsWith(`${table}.`) && cols.includes(column)) {
      const idxName = idxKey.slice(table.length + 1)
      impacts.push({
        severity: 'warning',
        objectType: 'index',
        objectName: idxName,
        reason: `Skip index '${idxName}' on ${table} references column '${column}'.`,
        ddlFragment: `INDEX ${idxName} ... ${column} ...`,
        column,
      })
    }
  }

  // ── WARNING: Default expression deps ──
  for (const [depKey, deps] of graph.defaultExprDeps) {
    if (depKey.startsWith(`${table}.`) && deps.includes(column)) {
      const depCol = depKey.slice(table.length + 1)
      impacts.push({
        severity: 'warning',
        objectType: 'default_expr',
        objectName: `${table}.${depCol}`,
        reason: `Column '${depCol}' has a DEFAULT/MATERIALIZED expression referencing '${column}'.`,
        ddlFragment: `${depCol} DEFAULT ... ${column} ...`,
        column,
      })
    }
  }

  // ── WARNING: Projection columns ──
  for (const [projKey, cols] of graph.projectionColumns) {
    if (projKey.startsWith(`${table}.`) && cols.includes(column)) {
      const projName = projKey.slice(table.length + 1)
      impacts.push({
        severity: 'warning',
        objectType: 'projection',
        objectName: projName,
        reason: `Projection '${projName}' uses column '${column}'.`,
        ddlFragment: `PROJECTION ${projName} ... ${column} ...`,
        column,
      })
    }
  }

  // ── WARNING: Constraint columns ──
  for (const [constKey, cols] of graph.constraintColumns) {
    if (constKey.startsWith(`${table}.`) && cols.includes(column)) {
      const constName = constKey.slice(table.length + 1)
      impacts.push({
        severity: 'warning',
        objectType: 'constraint',
        objectName: constName,
        reason: `Constraint '${constName}' references column '${column}'.`,
        ddlFragment: `CONSTRAINT ${constName} ... ${column} ...`,
        column,
      })
    }
  }

  // ── WARNING: Column grants ──
  const grants = graph.columnGrants.get(colKey)
  if (grants) {
    for (const role of grants) {
      impacts.push({
        severity: 'warning',
        objectType: 'grant',
        objectName: role,
        reason: `Column-level grant exists for '${column}' on ${table} for role '${role}'.`,
        ddlFragment: `GRANT SELECT(${column}) ON ${table} TO ${role}`,
        column,
      })
    }
  }

  // ── WARNING: Row policies ──
  for (const [policyName, dep] of graph.rowPolicies) {
    if (dep.table === table && dep.columns.includes(column)) {
      impacts.push({
        severity: 'warning',
        objectType: 'row_policy',
        objectName: policyName,
        reason: `Row policy '${policyName}' on ${table} references column '${column}'.`,
        ddlFragment: `CREATE ROW POLICY ${policyName} ... WHERE ${column} ...`,
        column,
      })
    }
  }

  return impacts
}

// ─── Table-level Impact Check (DROP TABLE) ───────────────────────────

function checkDropTableImpacts(table: string, graph: DependencyGraph): Impact[] {
  const impacts: Impact[] = []
  const brokenMVs: string[] = []

  // ── BREAK: MVs with source = table ──
  for (const [mv, sources] of graph.mvSources) {
    if (sources.includes(table)) {
      brokenMVs.push(mv)
      impacts.push({
        severity: 'break',
        objectType: 'mv',
        objectName: mv,
        reason: `MV reads FROM ${table}. Dropping the table will break this MV entirely.`,
        ddlFragment: `CREATE MATERIALIZED VIEW ${mv} AS SELECT ... FROM ${table}`,
      })
    }
  }

  // ── BREAK: Dicts with sourceTable = table ──
  for (const [dictName, dep] of graph.dictSources) {
    if (dep.sourceTable === table) {
      impacts.push({
        severity: 'break',
        objectType: 'dictionary',
        objectName: dictName,
        reason: `Dictionary '${dictName}' sources data from ${table}. Dropping the table will break the dictionary.`,
        ddlFragment: `DICTIONARY ${dictName} SOURCE(... ${table} ...)`,
      })
    }
  }

  // ── STALE: Target tables of broken MVs ──
  const staleTargets = new Set<string>()
  for (const mv of brokenMVs) {
    const target = graph.mvTargets.get(mv)
    if (target && !staleTargets.has(target)) {
      staleTargets.add(target)
      impacts.push({
        severity: 'stale',
        objectType: 'target_table',
        objectName: target,
        reason: `Target table will stop receiving new data — source MV ${mv} will be broken.`,
        ddlFragment: `TO ${target}`,
      })
    }
  }

  // ── STALE: Distributed tables ──
  for (const [distTable, localTable] of graph.distributedTables) {
    if (localTable === table) {
      impacts.push({
        severity: 'stale',
        objectType: 'distributed',
        objectName: distTable,
        reason: `Distributed table references ${table} as local table. Dropping it will break queries.`,
        ddlFragment: `Distributed(..., ${table})`,
      })
    }
  }

  // ── STALE: Buffer tables ──
  for (const [bufTable, destTable] of graph.bufferTables) {
    if (destTable === table) {
      impacts.push({
        severity: 'stale',
        objectType: 'buffer',
        objectName: bufTable,
        reason: `Buffer table flushes to ${table}. Dropping it will break buffer flushes.`,
        ddlFragment: `Buffer(..., ${table})`,
      })
    }
  }

  return impacts
}

// ─── Main Entry Point ────────────────────────────────────────────────

export function analyzeImpact(action: DDLAction, graph: DependencyGraph): Impact[] {
  switch (action.type) {
    case 'DROP_COLUMN':
      return checkColumnImpacts(action.table, action.column, graph, false)

    case 'RENAME_COLUMN':
      return checkColumnImpacts(action.table, action.oldName, graph, true)

    case 'MODIFY_COLUMN': {
      const colKey = `${action.table}.${action.column}`
      const oldType = graph.columnTypes.get(colKey)
      if (oldType && isTypeCompatible(oldType, action.newType)) {
        return []
      }
      // Incompatible type change — check all column dependencies
      const typeDesc = oldType ? `${oldType} → ${action.newType}` : `→ ${action.newType}`
      return checkColumnImpacts(action.table, action.column, graph, false).map((impact) => ({
        ...impact,
        reason: `Incompatible type change (${typeDesc}): ${impact.reason}`,
      }))
    }

    case 'DROP_TABLE':
      return checkDropTableImpacts(action.table, graph)
  }
}

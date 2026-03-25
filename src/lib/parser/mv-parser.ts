import { emptyParsedTable } from './types'
import type { ColumnReference, ParsedTable } from './types'

/**
 * Parse a MaterializedView DDL to extract source/target tables
 * and column references per clause.
 */
export function parseMaterializedView(
  ddl: string,
  knownColumns: Set<string>,
): Partial<ParsedTable> {
  const result = emptyParsedTable()

  // Extract TO target_table
  const toMatch = /\bTO\s+(?:`?(\w+)`?\.)?`?(\w+)`?/i.exec(ddl)
  if (toMatch) {
    const db = toMatch[1] ?? ''
    const tbl = toMatch[2] ?? ''
    result.targetTable = db ? `${db}.${tbl}` : tbl
  }

  // Extract the SELECT part (everything after AS SELECT or just SELECT)
  const asSelectMatch = /\bAS\s+(SELECT\b.+)$/is.exec(ddl)
  const selectDdl = asSelectMatch?.[1] ?? ''
  if (!selectDdl) return result

  // Check for SELECT *
  if (/\bSELECT\s+\*/i.test(selectDdl)) {
    result.selectsAll = true
  }

  // Build alias map: table aliases like "FROM events e" or "FROM db.events AS e"
  const aliasMap = new Map<string, string>()

  // Extract FROM table
  const fromMatch = /\bFROM\s+(?:`?(\w+)`?\.)?`?(\w+)`?(?:\s+(?:AS\s+)?(\w+))?/i.exec(selectDdl)
  if (fromMatch) {
    const db = fromMatch[1] ?? ''
    const tbl = fromMatch[2] ?? ''
    const fullName = db ? `${db}.${tbl}` : tbl
    result.sourceTable = fullName
    const alias = fromMatch[3]
    if (alias) {
      aliasMap.set(alias, fullName)
    }
  }

  // Extract JOIN tables
  const joinRe = /\bJOIN\s+(?:`?(\w+)`?\.)?`?(\w+)`?(?:\s+(?:AS\s+)?(\w+))?/gi
  let joinMatch: RegExpExecArray | null
  while ((joinMatch = joinRe.exec(selectDdl)) !== null) {
    const alias = joinMatch[3]
    if (alias) {
      const db = joinMatch[1] ?? ''
      const tbl = joinMatch[2] ?? ''
      aliasMap.set(alias, db ? `${db}.${tbl}` : tbl)
    }
  }

  // Extract column references from each clause
  const refs: ColumnReference[] = []

  // SELECT clause — between SELECT and FROM
  const selectClause = extractClause(selectDdl, /\bSELECT\b/i, /\bFROM\b/i)
  if (selectClause) {
    addRefs(refs, selectClause, 'select', knownColumns)
  }

  // WHERE clause
  const whereClause = extractClause(
    selectDdl,
    /\bWHERE\b/i,
    /\b(?:GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|$)/i,
  )
  if (whereClause) {
    addRefs(refs, whereClause, 'where', knownColumns)
  }

  // GROUP BY clause
  const groupByClause = extractClause(
    selectDdl,
    /\bGROUP\s+BY\b/i,
    /\b(?:HAVING|ORDER\s+BY|LIMIT|$)/i,
  )
  if (groupByClause) {
    addRefs(refs, groupByClause, 'group_by', knownColumns)
  }

  // ORDER BY clause (in SELECT, not the table one)
  const orderByClause = extractClause(selectDdl, /\bORDER\s+BY\b/i, /\b(?:LIMIT|$)/i)
  if (orderByClause) {
    addRefs(refs, orderByClause, 'order_by', knownColumns)
  }

  // JOIN USING
  const usingRe = /\bUSING\s*\(([^)]+)\)/gi
  let usingMatch: RegExpExecArray | null
  while ((usingMatch = usingRe.exec(selectDdl)) !== null) {
    if (usingMatch[1]) {
      addRefs(refs, usingMatch[1], 'join', knownColumns)
    }
  }

  // JOIN ON
  const onRe = /\bON\s+(.+?)(?=\bJOIN\b|\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/gi
  let onMatch: RegExpExecArray | null
  while ((onMatch = onRe.exec(selectDdl)) !== null) {
    if (onMatch[1]) {
      addRefs(refs, onMatch[1], 'join', knownColumns)
    }
  }

  result.referencedColumns = refs

  return result
}

function extractClause(ddl: string, startRe: RegExp, endRe: RegExp): string | null {
  const startMatch = startRe.exec(ddl)
  if (!startMatch) return null

  const afterStart = ddl.slice(startMatch.index + startMatch[0].length)
  const endMatch = endRe.exec(afterStart)
  if (endMatch) {
    return afterStart.slice(0, endMatch.index).trim()
  }
  return afterStart.trim()
}

function addRefs(
  refs: ColumnReference[],
  clause: string,
  context: ColumnReference['context'],
  knownColumns: Set<string>,
): void {
  // Tokenize: extract all identifiers, including dotted ones like "e.user_id"
  const tokenRe = /(?:(\w+)\.)?(\w+)/g
  let match: RegExpExecArray | null
  const seen = new Set<string>()

  while ((match = tokenRe.exec(clause)) !== null) {
    // match[2] is the column name (or alias.column — we take the column part)
    const col = match[2]
    if (col && knownColumns.has(col) && !seen.has(col)) {
      seen.add(col)
      refs.push({ column: col, context })
    }
  }
}

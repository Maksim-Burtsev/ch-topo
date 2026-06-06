import { emptyParsedTable } from './types'
import type { ColumnReference, ParsedTable } from './types'

interface IdentifierRead {
  value: string
  next: number
}

interface SourceScan {
  sourceTables: string[]
  aliasMap: Map<string, string>
}

const ALIAS_BOUNDARY_WORDS = new Set([
  'ALL',
  'ANY',
  'ARRAY',
  'AS',
  'CROSS',
  'FINAL',
  'FORMAT',
  'FULL',
  'GLOBAL',
  'GROUP',
  'HAVING',
  'INNER',
  'JOIN',
  'LEFT',
  'LIMIT',
  'ON',
  'ORDER',
  'OUTER',
  'PREWHERE',
  'RIGHT',
  'SAMPLE',
  'SELECT',
  'SETTINGS',
  'UNION',
  'USING',
  'WHERE',
])

/**
 * Parse a MaterializedView DDL to extract source/target tables
 * and column references per clause.
 */
export function parseMaterializedView(
  ddl: string,
  knownColumns: Set<string>,
  knownColumnsByTable: Map<string, Set<string>> = new Map(),
): Partial<ParsedTable> {
  const result = emptyParsedTable()

  const targetTable = readTableAfterKeyword(ddl, 'TO')
  if (targetTable) {
    result.targetTable = targetTable
  }

  const selectDdl = extractSelectQuery(ddl)
  if (!selectDdl) return result

  const sourceScan = scanSources(selectDdl)
  result.sourceTables = sourceScan.sourceTables
  result.sourceTable = sourceScan.sourceTables[0] ?? null

  const refs: ColumnReference[] = []

  const selectClause = extractClause(selectDdl, /\bSELECT\b/i, /\bFROM\b/i)
  if (selectClause) {
    result.selectStarSources = extractSelectStarSources(
      selectClause,
      sourceScan.aliasMap,
      sourceScan.sourceTables,
    )
    result.selectsAll = result.selectStarSources.length > 0

    addRefs(
      refs,
      selectClause,
      'select',
      knownColumns,
      sourceScan.aliasMap,
      sourceScan.sourceTables,
      knownColumnsByTable,
    )
  }

  const whereClause = extractClause(
    selectDdl,
    /\bWHERE\b/i,
    /\b(?:GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|$)/i,
  )
  if (whereClause) {
    addRefs(
      refs,
      whereClause,
      'where',
      knownColumns,
      sourceScan.aliasMap,
      sourceScan.sourceTables,
      knownColumnsByTable,
    )
  }

  const groupByClause = extractClause(
    selectDdl,
    /\bGROUP\s+BY\b/i,
    /\b(?:HAVING|ORDER\s+BY|LIMIT|$)/i,
  )
  if (groupByClause) {
    addRefs(
      refs,
      groupByClause,
      'group_by',
      knownColumns,
      sourceScan.aliasMap,
      sourceScan.sourceTables,
      knownColumnsByTable,
    )
  }

  const orderByClause = extractClause(selectDdl, /\bORDER\s+BY\b/i, /\b(?:LIMIT|$)/i)
  if (orderByClause) {
    addRefs(
      refs,
      orderByClause,
      'order_by',
      knownColumns,
      sourceScan.aliasMap,
      sourceScan.sourceTables,
      knownColumnsByTable,
    )
  }

  const usingRe = /\bUSING\s*\(([^)]+)\)/gi
  let usingMatch: RegExpExecArray | null
  while ((usingMatch = usingRe.exec(selectDdl)) !== null) {
    if (usingMatch[1]) {
      addRefs(
        refs,
        usingMatch[1],
        'join',
        knownColumns,
        sourceScan.aliasMap,
        sourceScan.sourceTables,
        knownColumnsByTable,
      )
    }
  }

  const onRe = /\bON\s+([\s\S]+?)(?=\bJOIN\b|\bWHERE\b|\bGROUP\b|\bORDER\b|\bLIMIT\b|$)/gi
  let onMatch: RegExpExecArray | null
  while ((onMatch = onRe.exec(selectDdl)) !== null) {
    if (onMatch[1]) {
      addRefs(
        refs,
        onMatch[1],
        'join',
        knownColumns,
        sourceScan.aliasMap,
        sourceScan.sourceTables,
        knownColumnsByTable,
      )
    }
  }

  result.referencedColumns = refs

  return result
}

function extractSelectQuery(ddl: string): string {
  const asMatch = /\bAS\b/i.exec(ddl)
  if (!asMatch) return ''

  let query = ddl.slice(asMatch.index + asMatch[0].length).trim()
  if (query.startsWith('(')) {
    const close = findMatchingParen(query, 0)
    if (close === query.length - 1) {
      query = query.slice(1, -1).trim()
    }
  }

  return /\bSELECT\b/i.test(query) ? query : ''
}

function readTableAfterKeyword(ddl: string, keyword: string): string | null {
  const re = new RegExp(`\\b${keyword}\\b`, 'i')
  const match = re.exec(ddl)
  if (!match) return null

  const table = readQualifiedName(ddl, match.index + match[0].length)
  return table?.value ?? null
}

function scanSources(sql: string): SourceScan {
  const cteSources = extractCteSources(sql)
  const sourceTables: string[] = []
  const aliasMap = new Map<string, string>()
  let i = 0

  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'" || ch === '`' || ch === '"') {
      i = skipQuoted(sql, i)
      continue
    }

    const readsFrom = isKeywordAt(sql, i, 'FROM')
    const readsJoin = isKeywordAt(sql, i, 'JOIN') && previousWord(sql, i) !== 'ARRAY'
    if (readsFrom || readsJoin) {
      const keywordLength = readsFrom ? 'FROM'.length : 'JOIN'.length
      const source = readSourceAfterKeyword(sql, i + keywordLength, cteSources)
      mergeSourceScan(sourceTables, aliasMap, source)
      i = Math.max(source.next, i + keywordLength)
      continue
    }

    i += 1
  }

  return { sourceTables, aliasMap }
}

function readSourceAfterKeyword(
  sql: string,
  start: number,
  cteSources: Map<string, string[]>,
): SourceScan & { next: number } {
  let i = skipWhitespace(sql, start)
  const sourceTables: string[] = []
  const aliasMap = new Map<string, string>()

  if (sql[i] === '(') {
    const close = findMatchingParen(sql, i)
    if (close === -1) return { sourceTables, aliasMap, next: i + 1 }

    const innerScan = scanSources(sql.slice(i + 1, close))
    for (const table of innerScan.sourceTables) {
      addUnique(sourceTables, table)
    }

    i = skipWhitespace(sql, close + 1)
    const alias = readOptionalAlias(sql, i)
    if (alias.alias && sourceTables.length === 1) {
      aliasMap.set(alias.alias, sourceTables[0] ?? '')
    }
    return { sourceTables, aliasMap, next: alias.next }
  }

  const table = readQualifiedName(sql, i)
  if (!table) return { sourceTables, aliasMap, next: i }

  i = skipWhitespace(sql, table.next)
  if (sql[i] === '(') {
    const close = findMatchingParen(sql, i)
    return { sourceTables, aliasMap, next: close === -1 ? i + 1 : close + 1 }
  }

  const cteTableSources = cteSources.get(table.value)
  const resolvedTables = cteTableSources ?? [table.value]
  for (const sourceTable of resolvedTables) {
    addUnique(sourceTables, sourceTable)
  }

  if (resolvedTables.length === 1) {
    const resolvedTable = resolvedTables[0] ?? ''
    aliasMap.set(table.value, resolvedTable)
    aliasMap.set(lastIdentifierPart(table.value), resolvedTable)
  }

  const alias = readOptionalAlias(sql, table.next)
  if (alias.alias && resolvedTables.length === 1) {
    aliasMap.set(alias.alias, resolvedTables[0] ?? '')
  }

  return { sourceTables, aliasMap, next: alias.next }
}

function extractCteSources(sql: string): Map<string, string[]> {
  const cteSources = new Map<string, string[]>()
  let i = skipWhitespace(sql, 0)

  if (!isKeywordAt(sql, i, 'WITH')) return cteSources
  i += 'WITH'.length

  while (i < sql.length) {
    i = skipWhitespace(sql, i)
    const name = readIdentifier(sql, i)
    if (!name) break

    i = skipWhitespace(sql, name.next)
    if (!isKeywordAt(sql, i, 'AS')) break
    i = skipWhitespace(sql, i + 'AS'.length)

    if (sql[i] !== '(') break
    const close = findMatchingParen(sql, i)
    if (close === -1) break

    const innerScan = scanSources(sql.slice(i + 1, close))
    cteSources.set(name.value, innerScan.sourceTables)

    i = skipWhitespace(sql, close + 1)
    if (sql[i] !== ',') break
    i += 1
  }

  return cteSources
}

function mergeSourceScan(
  sourceTables: string[],
  aliasMap: Map<string, string>,
  scan: SourceScan,
): void {
  for (const sourceTable of scan.sourceTables) {
    addUnique(sourceTables, sourceTable)
  }
  for (const [alias, sourceTable] of scan.aliasMap) {
    aliasMap.set(alias, sourceTable)
  }
}

function extractSelectStarSources(
  selectClause: string,
  aliasMap: Map<string, string>,
  sourceTables: string[],
): Array<string | null> {
  const identifier = '`(?:``|[^`])+`|"(?:[^"]|"")+"|[A-Za-z_][\\w$]*'
  const identifierGroup = `(?:${identifier})`
  const starRe = new RegExp(
    `(?:(${identifierGroup}(?:\\s*\\.\\s*${identifierGroup})*)\\s*\\.\\s*)?\\*`,
    'g',
  )
  const partRe = new RegExp(identifierGroup, 'g')
  const starSources: Array<string | null> = []
  let match: RegExpExecArray | null

  while ((match = starRe.exec(selectClause)) !== null) {
    if (isFunctionArgumentStar(selectClause, match.index)) continue

    const qualifier = match[1]
    if (!qualifier) {
      addUniqueStarSource(starSources, null)
      continue
    }

    const parts = Array.from(qualifier.matchAll(partRe), (part) =>
      normalizeIdentifier(part[0]),
    ).filter((part): part is string => Boolean(part))
    const sourceTable = aliasMap.get(parts.join('.'))
    if (sourceTable && sourceTables.includes(sourceTable)) {
      addUniqueStarSource(starSources, sourceTable)
    }
  }

  return starSources
}

function addUniqueStarSource(values: Array<string | null>, value: string | null): void {
  if (!values.includes(value)) {
    values.push(value)
  }
}

function isFunctionArgumentStar(sql: string, starIndex: number): boolean {
  let i = starIndex - 1
  while (i >= 0 && /\s/.test(sql[i] ?? '')) {
    i -= 1
  }

  return sql[i] === '('
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
  aliasMap: Map<string, string>,
  sourceTables: string[],
  knownColumnsByTable: Map<string, Set<string>>,
): void {
  const identifier = '`(?:``|[^`])+`|"(?:[^"]|"")+"|[A-Za-z_][\\w$]*'
  const identifierGroup = `(?:${identifier})`
  const tokenRe = new RegExp(`${identifierGroup}(?:\\s*\\.\\s*${identifierGroup})*`, 'g')
  const partRe = new RegExp(identifierGroup, 'g')
  const seen = new Set<string>()
  let match: RegExpExecArray | null

  while ((match = tokenRe.exec(clause)) !== null) {
    const parts = Array.from(match[0].matchAll(partRe), (part) =>
      normalizeIdentifier(part[0]),
    ).filter((part): part is string => Boolean(part))
    const col = parts[parts.length - 1]
    if (!col || !knownColumns.has(col)) continue

    const qualifier = parts.length > 1 ? parts.slice(0, -1).join('.') : null
    const sourceTable = resolveColumnSource(
      col,
      qualifier,
      aliasMap,
      sourceTables,
      knownColumnsByTable,
    )
    const key = `${sourceTable ?? ''}.${col}.${context}`
    if (seen.has(key)) continue

    seen.add(key)
    if (sourceTable) {
      refs.push({ column: col, sourceTable, context })
    } else {
      refs.push({ column: col, context })
    }
  }
}

function resolveColumnSource(
  column: string,
  qualifier: string | null,
  aliasMap: Map<string, string>,
  sourceTables: string[],
  knownColumnsByTable: Map<string, Set<string>>,
): string | undefined {
  if (qualifier) {
    return aliasMap.get(qualifier)
  }

  const matchingSources = sourceTables.filter((sourceTable) =>
    knownColumnsByTable.get(sourceTable)?.has(column),
  )
  if (matchingSources.length === 1) return matchingSources[0]
  if (sourceTables.length === 1) return sourceTables[0]

  return undefined
}

function readQualifiedName(sql: string, start: number): IdentifierRead | null {
  let i = skipWhitespace(sql, start)
  const first = readIdentifier(sql, i)
  if (!first) return null

  let value = first.value
  i = skipWhitespace(sql, first.next)

  while (sql[i] === '.') {
    const next = readIdentifier(sql, i + 1)
    if (!next) break
    value = `${value}.${next.value}`
    i = skipWhitespace(sql, next.next)
  }

  return { value, next: i }
}

function readIdentifier(sql: string, start: number): IdentifierRead | null {
  const i = skipWhitespace(sql, start)
  const ch = sql[i]
  if (!ch) return null

  if (ch === '`' || ch === '"') {
    const end = findQuotedEnd(sql, i)
    if (end === -1) return null
    return {
      value: normalizeIdentifier(sql.slice(i, end + 1)) ?? '',
      next: end + 1,
    }
  }

  if (!/[A-Za-z_]/.test(ch)) return null

  let end = i + 1
  while (end < sql.length && /[\w$]/.test(sql[end] ?? '')) {
    end += 1
  }

  return { value: sql.slice(i, end), next: end }
}

function readOptionalAlias(sql: string, start: number): { alias?: string; next: number } {
  let i = skipWhitespace(sql, start)
  let identifier = readIdentifier(sql, i)
  if (!identifier) return { next: start }

  if (identifier.value.toUpperCase() === 'AS') {
    i = skipWhitespace(sql, identifier.next)
    identifier = readIdentifier(sql, i)
    if (!identifier) return { next: start }
  }

  if (ALIAS_BOUNDARY_WORDS.has(identifier.value.toUpperCase())) {
    return { next: start }
  }

  return { alias: identifier.value, next: identifier.next }
}

function normalizeIdentifier(value: string | undefined): string | null {
  if (!value) return null
  if (value.startsWith('`') && value.endsWith('`')) {
    return value.slice(1, -1).replaceAll('``', '`')
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('""', '"')
  }
  return value
}

function lastIdentifierPart(value: string): string {
  const parts = value.split('.')
  return parts[parts.length - 1] ?? value
}

function addUnique(values: string[], value: string): void {
  if (value && !values.includes(value)) {
    values.push(value)
  }
}

function skipWhitespace(sql: string, start: number): number {
  let i = start
  while (i < sql.length && /\s/.test(sql[i] ?? '')) {
    i += 1
  }
  return i
}

function isKeywordAt(sql: string, index: number, keyword: string): boolean {
  if (sql.slice(index, index + keyword.length).toUpperCase() !== keyword) return false

  const before = sql[index - 1]
  const after = sql[index + keyword.length]
  return !isIdentifierChar(before) && !isIdentifierChar(after)
}

function isIdentifierChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\w$]/.test(ch)
}

function previousWord(sql: string, index: number): string | null {
  let i = index - 1
  while (i >= 0 && /\s/.test(sql[i] ?? '')) {
    i -= 1
  }

  const end = i + 1
  while (i >= 0 && /[A-Za-z_]/.test(sql[i] ?? '')) {
    i -= 1
  }

  return end > i + 1 ? sql.slice(i + 1, end).toUpperCase() : null
}

function skipQuoted(sql: string, start: number): number {
  const ch = sql[start]
  if (ch === "'") {
    let i = start + 1
    while (i < sql.length) {
      if (sql[i] === "'" && sql[i + 1] === "'") {
        i += 2
        continue
      }
      if (sql[i] === "'") return i + 1
      i += 1
    }
    return sql.length
  }

  const end = findQuotedEnd(sql, start)
  return end === -1 ? sql.length : end + 1
}

function findQuotedEnd(sql: string, start: number): number {
  const quote = sql[start]
  if (quote !== '`' && quote !== '"') return -1

  let i = start + 1
  while (i < sql.length) {
    if (sql[i] === quote && sql[i + 1] === quote) {
      i += 2
      continue
    }
    if (sql[i] === quote) return i
    i += 1
  }

  return -1
}

function findMatchingParen(sql: string, start: number): number {
  let depth = 0
  let i = start

  while (i < sql.length) {
    const ch = sql[i]
    if (ch === "'" || ch === '`' || ch === '"') {
      i = skipQuoted(sql, i)
      continue
    }

    if (ch === '(') {
      depth += 1
    } else if (ch === ')') {
      depth -= 1
      if (depth === 0) return i
    }

    i += 1
  }

  return -1
}

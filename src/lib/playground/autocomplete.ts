import type * as Monaco from 'monaco-editor'
import type { RawTableRow, RawColumnRow } from '@/lib/clickhouse/types'

// ── ClickHouse keywords & functions ────────────────────────────

const CH_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'ORDER BY',
  'LIMIT',
  'JOIN',
  'ON',
  'USING',
  'AS',
  'WITH',
  'HAVING',
  'UNION ALL',
  'INSERT INTO',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'LEFT JOIN',
  'RIGHT JOIN',
  'INNER JOIN',
  'CROSS JOIN',
  'FULL JOIN',
  'ANY JOIN',
  'ALL JOIN',
  'GLOBAL JOIN',
  'SEMI JOIN',
  'ANTI JOIN',
  'ARRAY JOIN',
  'PREWHERE',
  'SAMPLE',
  'FINAL',
  'FORMAT',
  'SETTINGS',
  'DISTINCT',
  'NOT',
  'AND',
  'OR',
  'IN',
  'BETWEEN',
  'LIKE',
  'ILIKE',
  'IS NULL',
  'IS NOT NULL',
  'EXISTS',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'ASC',
  'DESC',
  'NULLS FIRST',
  'NULLS LAST',
  'OFFSET',
  'INTO OUTFILE',
  'MATERIALIZED VIEW',
]

const CH_FUNCTIONS = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'uniq',
  'uniqExact',
  'uniqHLL12',
  'uniqCombined',
  'any',
  'anyLast',
  'argMin',
  'argMax',
  'groupArray',
  'groupUniqArray',
  'groupArrayInsertAt',
  'quantile',
  'quantiles',
  'median',
  'toDate',
  'toDateTime',
  'toUInt32',
  'toUInt64',
  'toInt32',
  'toInt64',
  'toFloat64',
  'toString',
  'toFixedString',
  'toDecimal32',
  'toStartOfDay',
  'toStartOfMonth',
  'toStartOfWeek',
  'toStartOfHour',
  'toStartOfMinute',
  'toYYYYMM',
  'toYYYYMMDD',
  'now',
  'today',
  'yesterday',
  'formatDateTime',
  'dateDiff',
  'dateAdd',
  'dateSub',
  'arrayJoin',
  'arrayMap',
  'arrayFilter',
  'arrayExists',
  'length',
  'empty',
  'notEmpty',
  'if',
  'multiIf',
  'coalesce',
  'nullIf',
  'ifNull',
  'intHash32',
  'intHash64',
  'cityHash64',
  'sipHash64',
  'MD5',
  'SHA256',
  'hex',
  'unhex',
  'base64Encode',
  'base64Decode',
  'concat',
  'substring',
  'lower',
  'upper',
  'trim',
  'splitByChar',
  'replaceAll',
  'replaceRegexpOne',
  'match',
  'extract',
  'like',
  'multiSearchAllPositions',
  'JSONExtract',
  'JSONExtractString',
  'JSONExtractInt',
  'JSONExtractFloat',
  'JSONExtractBool',
  'JSONExtractRaw',
  'dictGet',
  'dictGetOrDefault',
  'dictHas',
  'generateUUIDv4',
  'tuple',
  'tupleElement',
  'rowNumberInAllBlocks',
  'runningAccumulate',
]

// ── Schema data structure ──────────────────────────────────────

export interface SchemaDatabase {
  name: string
  tables: SchemaTable[]
}

export interface SchemaTable {
  database: string
  name: string
  columns: SchemaColumn[]
}

export interface SchemaColumn {
  name: string
  type: string
}

// ── Build schema lookup from raw rows ──────────────────────────

export function buildSchemaLookup(
  tables: RawTableRow[],
  columns: RawColumnRow[],
): SchemaDatabase[] {
  const dbMap = new Map<string, Map<string, SchemaColumn[]>>()

  for (const t of tables) {
    let tableMap = dbMap.get(t.database)
    if (!tableMap) {
      tableMap = new Map()
      dbMap.set(t.database, tableMap)
    }
    if (!tableMap.has(t.name)) {
      tableMap.set(t.name, [])
    }
  }

  for (const c of columns) {
    const tableMap = dbMap.get(c.database)
    if (!tableMap) continue
    const cols = tableMap.get(c.table)
    if (!cols) continue
    cols.push({ name: c.name, type: c.type })
  }

  const result: SchemaDatabase[] = []
  for (const [dbName, tableMap] of dbMap) {
    const dbTables: SchemaTable[] = []
    for (const [tableName, cols] of tableMap) {
      dbTables.push({ database: dbName, name: tableName, columns: cols })
    }
    result.push({ name: dbName, tables: dbTables })
  }

  return result
}

// ── Text before cursor helpers ─────────────────────────────────

function getTextBeforeCursor(model: Monaco.editor.ITextModel, position: Monaco.Position): string {
  return model.getValueInRange({
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: position.lineNumber,
    endColumn: position.column,
  })
}

// ── Detect context ─────────────────────────────────────────────

type CompletionContext =
  | { kind: 'dot-database'; database: string }
  | { kind: 'dot-table'; database: string; table: string }
  | { kind: 'after-from-join' }
  | { kind: 'after-select' }
  | { kind: 'after-where' }
  | { kind: 'after-group-order' }
  | { kind: 'keyword' }
  | { kind: 'general' }

/**
 * Find the FROM table in the current statement so we can suggest its columns.
 * Returns `database.table` or just `table` if found.
 */
function findFromTable(textBefore: string): string | null {
  // Match the last FROM <table> clause before cursor (handles aliases)
  const match = textBefore.match(/\bFROM\s+([\w]+(?:\.[\w]+)?)/i)
  return match?.[1] ?? null
}

function resolveTable(schema: SchemaDatabase[], ref: string): SchemaTable | null {
  if (ref.includes('.')) {
    const [db, tbl] = ref.split('.')
    const database = schema.find((d) => d.name.toLowerCase() === db?.toLowerCase())
    return database?.tables.find((t) => t.name.toLowerCase() === tbl?.toLowerCase()) ?? null
  }
  for (const db of schema) {
    const found = db.tables.find((t) => t.name.toLowerCase() === ref.toLowerCase())
    if (found) return found
  }
  return null
}

function detectContext(
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
): CompletionContext {
  const textBefore = getTextBeforeCursor(model, position)
  const lineContent = model.getLineContent(position.lineNumber)
  const textBeforeOnLine = lineContent.substring(0, position.column - 1)

  // Check for double-dot pattern: database.table.
  const doubleDotMatch = textBeforeOnLine.match(/(\w+)\.(\w+)\.\s*$/)
  if (doubleDotMatch?.[1] && doubleDotMatch[2]) {
    return {
      kind: 'dot-table',
      database: doubleDotMatch[1],
      table: doubleDotMatch[2],
    }
  }

  // Check for single-dot pattern: something.
  const singleDotMatch = textBeforeOnLine.match(/(\w+)\.\s*$/)
  if (singleDotMatch?.[1]) {
    return { kind: 'dot-database', database: singleDotMatch[1] }
  }

  // Check for dot pattern with partial word: database.table.col|
  const dotPartialMatch = textBeforeOnLine.match(/(\w+)\.(\w+)\.(\w*)$/)
  if (dotPartialMatch?.[1] && dotPartialMatch[2]) {
    return {
      kind: 'dot-table',
      database: dotPartialMatch[1],
      table: dotPartialMatch[2],
    }
  }

  // Check for single dot with partial: database.tab|
  const dotSinglePartialMatch = textBeforeOnLine.match(/(\w+)\.(\w*)$/)
  if (dotSinglePartialMatch?.[1]) {
    return { kind: 'dot-database', database: dotSinglePartialMatch[1] }
  }

  // Check if cursor is after FROM or JOIN keyword
  const fromJoinPattern =
    /\b(FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|CROSS\s+JOIN|FULL\s+JOIN|ANY\s+JOIN|ALL\s+JOIN|GLOBAL\s+JOIN|SEMI\s+JOIN|ANTI\s+JOIN|ARRAY\s+JOIN)\s+\w*$/i
  if (fromJoinPattern.test(textBefore)) {
    return { kind: 'after-from-join' }
  }

  // Check if cursor is after SELECT (suggest columns + functions + *)
  if (/\bSELECT\s+(?:[\w\s,.*()]+,\s*)?\w*$/i.test(textBefore)) {
    return { kind: 'after-select' }
  }

  // Check if cursor is after WHERE/AND/OR/HAVING (suggest columns)
  if (/\b(WHERE|AND|OR|HAVING)\s+\w*$/i.test(textBefore)) {
    return { kind: 'after-where' }
  }

  // Check if cursor is after GROUP BY or ORDER BY (suggest columns)
  if (/\b(GROUP\s+BY|ORDER\s+BY)\s+(?:[\w\s,]+,\s*)?\w*$/i.test(textBefore)) {
    return { kind: 'after-group-order' }
  }

  // Check if we're at line start or after only whitespace — suggest keywords
  if (/^\s*\w*$/.test(textBeforeOnLine)) {
    return { kind: 'keyword' }
  }

  return { kind: 'general' }
}

// ── Build completion items ─────────────────────────────────────

function makeRange(model: Monaco.editor.ITextModel, position: Monaco.Position): Monaco.IRange {
  const word = model.getWordUntilPosition(position)
  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  }
}

function isSystemDatabase(name: string): boolean {
  const lower = name.toLowerCase()
  return lower === 'system' || lower === 'information_schema'
}

function makeKeywordItem(
  kw: string,
  CIK: typeof Monaco.languages.CompletionItemKind,
  range: Monaco.IRange,
  sortPrefix: string,
): Monaco.languages.CompletionItem {
  return {
    label: kw,
    kind: CIK.Keyword,
    insertText: kw,
    filterText: kw.toLowerCase(),
    sortText: `${sortPrefix}${kw.toLowerCase()}`,
    range,
  }
}

function makeFunctionItem(
  fn: string,
  CIK: typeof Monaco.languages.CompletionItemKind,
  range: Monaco.IRange,
  sortPrefix: string,
): Monaco.languages.CompletionItem {
  return {
    label: fn,
    kind: CIK.Function,
    detail: 'function',
    insertText: fn,
    filterText: fn.toLowerCase(),
    sortText: `${sortPrefix}${fn.toLowerCase()}`,
    range,
  }
}

function makeColumnItem(
  col: SchemaColumn,
  CIK: typeof Monaco.languages.CompletionItemKind,
  range: Monaco.IRange,
  sortPrefix: string,
): Monaco.languages.CompletionItem {
  return {
    label: col.name,
    kind: CIK.Field,
    detail: col.type,
    insertText: col.name,
    filterText: col.name.toLowerCase(),
    sortText: `${sortPrefix}${col.name.toLowerCase()}`,
    range,
  }
}

function addColumnsFromContext(
  suggestions: Monaco.languages.CompletionItem[],
  schema: SchemaDatabase[],
  textBefore: string,
  CIK: typeof Monaco.languages.CompletionItemKind,
  range: Monaco.IRange,
  sortPrefix: string,
) {
  const fromRef = findFromTable(textBefore)
  if (fromRef) {
    const table = resolveTable(schema, fromRef)
    if (table) {
      for (const col of table.columns) {
        suggestions.push(makeColumnItem(col, CIK, range, sortPrefix))
      }
      return
    }
  }
  // Fallback: show columns from all non-system tables
  for (const db of schema) {
    if (isSystemDatabase(db.name)) continue
    for (const table of db.tables) {
      for (const col of table.columns) {
        suggestions.push(makeColumnItem(col, CIK, range, sortPrefix))
      }
    }
  }
}

function addTableItems(
  suggestions: Monaco.languages.CompletionItem[],
  schema: SchemaDatabase[],
  CIK: typeof Monaco.languages.CompletionItemKind,
  range: Monaco.IRange,
  sortPrefix: string,
) {
  for (const db of schema) {
    if (isSystemDatabase(db.name)) continue
    suggestions.push({
      label: db.name,
      kind: CIK.Module,
      detail: 'database',
      insertText: db.name,
      filterText: db.name.toLowerCase(),
      sortText: `${sortPrefix}0_${db.name.toLowerCase()}`,
      range,
    })
    for (const table of db.tables) {
      suggestions.push({
        label: table.name,
        kind: CIK.Struct,
        detail: `${db.name}.${table.name}`,
        insertText: table.name,
        filterText: table.name.toLowerCase(),
        sortText: `${sortPrefix}1_${table.name.toLowerCase()}`,
        range,
      })
      suggestions.push({
        label: `${db.name}.${table.name}`,
        kind: CIK.Struct,
        detail: db.name,
        insertText: `${db.name}.${table.name}`,
        filterText: `${db.name}.${table.name}`.toLowerCase(),
        sortText: `${sortPrefix}2_${db.name}.${table.name}`.toLowerCase(),
        range,
      })
    }
  }
}

export function provideCompletionItems(
  schema: SchemaDatabase[],
  model: Monaco.editor.ITextModel,
  position: Monaco.Position,
  monaco: typeof Monaco,
): Monaco.languages.CompletionList {
  const range = makeRange(model, position)
  const context = detectContext(model, position)
  const suggestions: Monaco.languages.CompletionItem[] = []
  const CIK = monaco.languages.CompletionItemKind

  if (context.kind === 'dot-table') {
    // database.table. → show columns
    const db = schema.find((d) => d.name.toLowerCase() === context.database.toLowerCase())
    if (db) {
      const table = db.tables.find((t) => t.name.toLowerCase() === context.table.toLowerCase())
      if (table) {
        for (const col of table.columns) {
          suggestions.push(makeColumnItem(col, CIK, range, '0_'))
        }
      }
    }
    return { suggestions }
  }

  if (context.kind === 'dot-database') {
    // database. → show tables OR table. → show columns
    const db = schema.find((d) => d.name.toLowerCase() === context.database.toLowerCase())
    if (db) {
      for (const table of db.tables) {
        suggestions.push({
          label: table.name,
          kind: CIK.Struct,
          detail: `${db.name}.${table.name}`,
          insertText: table.name,
          filterText: table.name.toLowerCase(),
          sortText: `0_${table.name.toLowerCase()}`,
          range,
        })
      }
      return { suggestions }
    }

    // Maybe it's a table name — show columns
    for (const d of schema) {
      for (const table of d.tables) {
        if (table.name.toLowerCase() === context.database.toLowerCase()) {
          for (const col of table.columns) {
            suggestions.push(makeColumnItem(col, CIK, range, '0_'))
          }
        }
      }
    }
    return { suggestions }
  }

  if (context.kind === 'after-from-join') {
    // After FROM/JOIN → show ONLY databases and tables (no keywords, no functions)
    addTableItems(suggestions, schema, CIK, range, '0_')
    return { suggestions }
  }

  if (context.kind === 'after-select') {
    // After SELECT → columns (from FROM table if known), functions, *
    const textBefore = getTextBeforeCursor(model, position)
    suggestions.push({
      label: '*',
      kind: CIK.Operator,
      insertText: '*',
      sortText: '0_',
      range,
    })
    addColumnsFromContext(suggestions, schema, textBefore, CIK, range, '1_')
    for (const fn of CH_FUNCTIONS) {
      suggestions.push(makeFunctionItem(fn, CIK, range, '2_'))
    }
    return { suggestions }
  }

  if (context.kind === 'after-where') {
    // After WHERE/AND/OR → columns from FROM table
    const textBefore = getTextBeforeCursor(model, position)
    addColumnsFromContext(suggestions, schema, textBefore, CIK, range, '0_')
    for (const fn of CH_FUNCTIONS) {
      suggestions.push(makeFunctionItem(fn, CIK, range, '1_'))
    }
    return { suggestions }
  }

  if (context.kind === 'after-group-order') {
    // After GROUP BY / ORDER BY → columns from FROM table
    const textBefore = getTextBeforeCursor(model, position)
    addColumnsFromContext(suggestions, schema, textBefore, CIK, range, '0_')
    return { suggestions }
  }

  if (context.kind === 'keyword') {
    // Line start or after whitespace — prioritize keywords
    for (const kw of CH_KEYWORDS) {
      suggestions.push(makeKeywordItem(kw, CIK, range, '0_'))
    }
    // Also show tables and functions at lower priority
    addTableItems(suggestions, schema, CIK, range, '2_')
    for (const fn of CH_FUNCTIONS) {
      suggestions.push(makeFunctionItem(fn, CIK, range, '1_'))
    }
    return { suggestions }
  }

  // General context — keywords first, then tables, then functions
  for (const kw of CH_KEYWORDS) {
    suggestions.push(makeKeywordItem(kw, CIK, range, '0_'))
  }

  // Non-system databases and tables
  for (const db of schema) {
    if (isSystemDatabase(db.name)) continue
    suggestions.push({
      label: db.name,
      kind: CIK.Module,
      detail: 'database',
      insertText: db.name,
      filterText: db.name.toLowerCase(),
      sortText: `1_${db.name.toLowerCase()}`,
      range,
    })
    for (const table of db.tables) {
      suggestions.push({
        label: table.name,
        kind: CIK.Struct,
        detail: `${db.name}.${table.name}`,
        insertText: table.name,
        filterText: table.name.toLowerCase(),
        sortText: `1_${table.name.toLowerCase()}`,
        range,
      })
    }
  }

  for (const fn of CH_FUNCTIONS) {
    suggestions.push(makeFunctionItem(fn, CIK, range, '2_'))
  }

  return { suggestions }
}

// ── Register completion provider ───────────────────────────────

export function registerSqlCompletionProvider(
  monaco: typeof Monaco,
  getSchema: () => SchemaDatabase[],
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems(model, position) {
      const schema = getSchema()
      return provideCompletionItems(schema, model, position, monaco)
    },
  })
}

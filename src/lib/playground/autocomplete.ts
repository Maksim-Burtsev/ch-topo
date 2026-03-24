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
  | { kind: 'general' }

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

  // Check for dot pattern with partial word: database.tab|
  const dotPartialMatch = textBeforeOnLine.match(/(\w+)\.(\w+)\.(\w*)$/)
  if (dotPartialMatch?.[1] && dotPartialMatch[2]) {
    return {
      kind: 'dot-table',
      database: dotPartialMatch[1],
      table: dotPartialMatch[2],
    }
  }

  const dotSinglePartialMatch = textBeforeOnLine.match(/(\w+)\.(\w*)$/)
  if (dotSinglePartialMatch?.[1]) {
    return { kind: 'dot-database', database: dotSinglePartialMatch[1] }
  }

  // Check if cursor is after FROM or JOIN keyword
  const upperText = textBefore.toUpperCase()
  const fromJoinPattern =
    /\b(FROM|JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|INNER\s+JOIN|CROSS\s+JOIN|FULL\s+JOIN|ANY\s+JOIN|ALL\s+JOIN|GLOBAL\s+JOIN|SEMI\s+JOIN|ANTI\s+JOIN|ARRAY\s+JOIN)\s+\w*$/i
  if (fromJoinPattern.test(upperText)) {
    return { kind: 'after-from-join' }
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
          suggestions.push({
            label: col.name,
            kind: CIK.Field,
            detail: col.type,
            insertText: col.name,
            range,
          })
        }
      }
    }
    return { suggestions }
  }

  if (context.kind === 'dot-database') {
    // database. → show tables (and columns if it's a table name)
    const db = schema.find((d) => d.name.toLowerCase() === context.database.toLowerCase())
    if (db) {
      for (const table of db.tables) {
        suggestions.push({
          label: table.name,
          kind: CIK.Struct,
          detail: `${db.name}.${table.name}`,
          insertText: table.name,
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
            suggestions.push({
              label: col.name,
              kind: CIK.Field,
              detail: col.type,
              insertText: col.name,
              range,
            })
          }
        }
      }
    }
    if (suggestions.length > 0) return { suggestions }

    return { suggestions }
  }

  if (context.kind === 'after-from-join') {
    // After FROM/JOIN → show database.table and just table names
    for (const db of schema) {
      suggestions.push({
        label: db.name,
        kind: CIK.Module,
        detail: 'database',
        insertText: db.name,
        range,
      })
      for (const table of db.tables) {
        suggestions.push({
          label: table.name,
          kind: CIK.Struct,
          detail: `${db.name}.${table.name}`,
          insertText: table.name,
          range,
        })
        suggestions.push({
          label: `${db.name}.${table.name}`,
          kind: CIK.Struct,
          detail: db.name,
          insertText: `${db.name}.${table.name}`,
          range,
        })
      }
    }
    return { suggestions }
  }

  // General context — show everything
  // Databases
  for (const db of schema) {
    suggestions.push({
      label: db.name,
      kind: CIK.Module,
      detail: 'database',
      insertText: db.name,
      range,
    })

    // Tables (unqualified)
    for (const table of db.tables) {
      suggestions.push({
        label: table.name,
        kind: CIK.Struct,
        detail: `${db.name}.${table.name}`,
        insertText: table.name,
        range,
      })
    }
  }

  // ClickHouse keywords
  for (const kw of CH_KEYWORDS) {
    suggestions.push({
      label: kw,
      kind: CIK.Keyword,
      insertText: kw,
      range,
    })
  }

  // ClickHouse functions
  for (const fn of CH_FUNCTIONS) {
    suggestions.push({
      label: fn,
      kind: CIK.Function,
      detail: 'function',
      insertText: fn,
      range,
    })
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

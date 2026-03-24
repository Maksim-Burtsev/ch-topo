import { beforeAll, describe, expect, it } from 'vitest'
import type { RawTableRow, RawColumnRow } from '@/lib/clickhouse/types'
import {
  buildSchemaLookup,
  provideCompletionItems,
  type SchemaDatabase,
} from '../autocomplete'

// ── Mock data ──────────────────────────────────────────────────

const rawTables: RawTableRow[] = [
  {
    database: 'analytics',
    name: 'events',
    engine: 'MergeTree',
    total_rows: '1000',
    total_bytes: '5000',
    data_compressed_bytes: '2000',
    create_table_query: '',
    sorting_key: 'event_date',
    partition_key: '',
    metadata_modification_time: '',
  },
  {
    database: 'analytics',
    name: 'sessions',
    engine: 'MergeTree',
    total_rows: '500',
    total_bytes: '3000',
    data_compressed_bytes: '1000',
    create_table_query: '',
    sorting_key: 'session_date',
    partition_key: '',
    metadata_modification_time: '',
  },
  {
    database: 'marketing',
    name: 'campaigns',
    engine: 'MergeTree',
    total_rows: '100',
    total_bytes: '1000',
    data_compressed_bytes: '500',
    create_table_query: '',
    sorting_key: 'id',
    partition_key: '',
    metadata_modification_time: '',
  },
]

const rawColumns: RawColumnRow[] = [
  {
    database: 'analytics',
    table: 'events',
    name: 'event_id',
    type: 'UUID',
    default_kind: '',
    default_expression: '',
    compression_codec: '',
  },
  {
    database: 'analytics',
    table: 'events',
    name: 'event_date',
    type: 'Date',
    default_kind: '',
    default_expression: '',
    compression_codec: '',
  },
  {
    database: 'analytics',
    table: 'events',
    name: 'user_id',
    type: 'UInt64',
    default_kind: '',
    default_expression: '',
    compression_codec: '',
  },
  {
    database: 'analytics',
    table: 'sessions',
    name: 'session_id',
    type: 'String',
    default_kind: '',
    default_expression: '',
    compression_codec: '',
  },
  {
    database: 'marketing',
    table: 'campaigns',
    name: 'id',
    type: 'UInt64',
    default_kind: '',
    default_expression: '',
    compression_codec: '',
  },
  {
    database: 'marketing',
    table: 'campaigns',
    name: 'name',
    type: 'String',
    default_kind: '',
    default_expression: '',
    compression_codec: '',
  },
]

// ── Monaco mock ────────────────────────────────────────────────

const CompletionItemKind = {
  Method: 0,
  Function: 1,
  Constructor: 2,
  Field: 3,
  Variable: 4,
  Class: 5,
  Struct: 6,
  Interface: 7,
  Module: 8,
  Property: 9,
  Event: 10,
  Operator: 11,
  Unit: 12,
  Value: 13,
  Constant: 14,
  Enum: 15,
  EnumMember: 16,
  Keyword: 17,
  Text: 18,
  Color: 19,
  File: 20,
  Reference: 21,
  Customcolor: 22,
  Folder: 23,
  TypeParameter: 24,
  User: 25,
  Issue: 26,
  Snippet: 27,
}

const mockMonaco = {
  languages: {
    CompletionItemKind,
    registerCompletionItemProvider: () => ({ dispose: () => {} }),
  },
} as never

function createMockModel(fullText: string) {
  const lines = fullText.split('\n')
  return {
    getValueInRange(range: {
      startLineNumber: number
      startColumn: number
      endLineNumber: number
      endColumn: number
    }) {
      const result: string[] = []
      for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
        const line = lines[i - 1] ?? ''
        const start = i === range.startLineNumber ? range.startColumn - 1 : 0
        const end = i === range.endLineNumber ? range.endColumn - 1 : line.length
        result.push(line.substring(start, end))
      }
      return result.join('\n')
    },
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    getWordUntilPosition(position: { lineNumber: number; column: number }) {
      const line = lines[position.lineNumber - 1] ?? ''
      const textBefore = line.substring(0, position.column - 1)
      const match = textBefore.match(/(\w*)$/)
      const word = match?.[1] ?? ''
      const startColumn = position.column - word.length
      return {
        word,
        startColumn,
        endColumn: position.column,
      }
    },
  } as never
}

function createPosition(lineNumber: number, column: number) {
  return { lineNumber, column } as never
}

// ── Tests ──────────────────────────────────────────────────────

describe('buildSchemaLookup', () => {
  it('groups tables and columns by database', () => {
    const schema = buildSchemaLookup(rawTables, rawColumns)

    expect(schema).toHaveLength(2)

    const analytics = schema.find((d) => d.name === 'analytics')
    expect(analytics).toBeDefined()
    expect(analytics?.tables).toHaveLength(2)

    const events = analytics?.tables.find((t) => t.name === 'events')
    expect(events).toBeDefined()
    expect(events?.columns).toHaveLength(3)
    expect(events?.columns[0]).toEqual({ name: 'event_id', type: 'UUID' })

    const marketing = schema.find((d) => d.name === 'marketing')
    expect(marketing).toBeDefined()
    expect(marketing?.tables).toHaveLength(1)
    expect(marketing?.tables[0]?.columns).toHaveLength(2)
  })

  it('handles empty input', () => {
    const schema = buildSchemaLookup([], [])
    expect(schema).toEqual([])
  })

  it('handles tables with no columns', () => {
    const schema = buildSchemaLookup(rawTables.slice(0, 1), [])
    expect(schema).toHaveLength(1)
    expect(schema[0]?.tables[0]?.columns).toEqual([])
  })
})

describe('provideCompletionItems', () => {
  let schema: SchemaDatabase[]

  beforeAll(() => {
    schema = buildSchemaLookup(rawTables, rawColumns)
  })

  it('suggests databases, tables, keywords, and functions in general context', () => {
    const model = createMockModel('SEL')
    const position = createPosition(1, 4)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)

    // Databases
    expect(labels).toContain('analytics')
    expect(labels).toContain('marketing')

    // Tables
    expect(labels).toContain('events')
    expect(labels).toContain('sessions')
    expect(labels).toContain('campaigns')

    // Keywords
    expect(labels).toContain('SELECT')
    expect(labels).toContain('FROM')
    expect(labels).toContain('WHERE')

    // Functions
    expect(labels).toContain('count')
    expect(labels).toContain('sum')
    expect(labels).toContain('toDate')
  })

  it('suggests tables after database dot', () => {
    const model = createMockModel('SELECT * FROM analytics.')
    const position = createPosition(1, 25)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('events')
    expect(labels).toContain('sessions')
    expect(labels).not.toContain('campaigns')
    // Should not include keywords in dot context
    expect(labels).not.toContain('SELECT')
  })

  it('suggests columns after database.table dot', () => {
    const model = createMockModel('SELECT analytics.events.')
    const position = createPosition(1, 25)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('event_id')
    expect(labels).toContain('event_date')
    expect(labels).toContain('user_id')
    expect(labels).not.toContain('session_id')
  })

  it('shows column type in detail for column completions', () => {
    const model = createMockModel('SELECT analytics.events.')
    const position = createPosition(1, 25)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const eventId = result.suggestions.find((s) => s.label === 'event_id')
    expect(eventId?.detail).toBe('UUID')

    const eventDate = result.suggestions.find((s) => s.label === 'event_date')
    expect(eventDate?.detail).toBe('Date')
  })

  it('suggests columns when dot follows a table name (unqualified)', () => {
    const model = createMockModel('SELECT events.')
    const position = createPosition(1, 15)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('event_id')
    expect(labels).toContain('event_date')
    expect(labels).toContain('user_id')
  })

  it('suggests databases and tables after FROM keyword', () => {
    const model = createMockModel('SELECT * FROM ')
    const position = createPosition(1, 15)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('analytics')
    expect(labels).toContain('marketing')
    expect(labels).toContain('events')
    expect(labels).toContain('analytics.events')
    // Should not include keywords in FROM context
    expect(labels).not.toContain('SELECT')
  })

  it('suggests databases and tables after JOIN keyword', () => {
    const model = createMockModel('SELECT * FROM events JOIN ')
    const position = createPosition(1, 27)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('analytics')
    expect(labels).toContain('sessions')
    expect(labels).toContain('analytics.sessions')
  })

  it('suggests databases and tables after LEFT JOIN', () => {
    const model = createMockModel('SELECT * FROM events LEFT JOIN ')
    const position = createPosition(1, 32)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('analytics')
    expect(labels).toContain('sessions')
  })

  it('works with multi-line queries', () => {
    const model = createMockModel('SELECT *\nFROM analytics.')
    const position = createPosition(2, 16)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('events')
    expect(labels).toContain('sessions')
  })

  it('handles empty schema', () => {
    const model = createMockModel('SELECT * FROM ')
    const position = createPosition(1, 15)
    const result = provideCompletionItems([], model, position, mockMonaco)

    // Should still have suggestions (FROM context returns databases/tables, but schema is empty)
    // No error should be thrown
    expect(result.suggestions).toBeDefined()
  })

  it('includes ClickHouse-specific functions', () => {
    const model = createMockModel('SELECT ')
    const position = createPosition(1, 8)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('uniq')
    expect(labels).toContain('uniqExact')
    expect(labels).toContain('arrayJoin')
    expect(labels).toContain('groupArray')
    expect(labels).toContain('JSONExtract')
    expect(labels).toContain('dictGet')
  })

  it('includes ClickHouse SQL keywords', () => {
    const model = createMockModel('')
    const position = createPosition(1, 1)
    const result = provideCompletionItems(schema, model, position, mockMonaco)

    const labels = result.suggestions.map((s) => s.label)
    expect(labels).toContain('SELECT')
    expect(labels).toContain('FROM')
    expect(labels).toContain('WHERE')
    expect(labels).toContain('GROUP BY')
    expect(labels).toContain('ORDER BY')
    expect(labels).toContain('LIMIT')
    expect(labels).toContain('JOIN')
    expect(labels).toContain('UNION ALL')
    expect(labels).toContain('INSERT INTO')
    expect(labels).toContain('CREATE TABLE')
    expect(labels).toContain('ALTER TABLE')
    expect(labels).toContain('DROP TABLE')
  })
})

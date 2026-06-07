import type { RawColumnRow, RawTableRow } from '@/lib/clickhouse/types'

export interface StarterQuery {
  id: string
  title: string
  description: string
  badge: string
  sql: string
}

const SYSTEM_DATABASES = new Set(['system', 'INFORMATION_SCHEMA', 'information_schema'])

function quoteIdent(value: string): string {
  return `\`${value.replaceAll('`', '``')}\``
}

function tableRef(table: RawTableRow): string {
  return `${quoteIdent(table.database)}.${quoteIdent(table.name)}`
}

function tableColumns(table: RawTableRow, columns: RawColumnRow[]): RawColumnRow[] {
  return columns.filter((col) => col.database === table.database && col.table === table.name)
}

function isStringType(type: string): boolean {
  return /\b(String|LowCardinality\(String\)|Enum8|Enum16|UUID|IPv4|IPv6)\b/i.test(type)
}

function isDateType(type: string): boolean {
  return /\b(Date|DateTime|DateTime64)\b/i.test(type)
}

function isNumericType(type: string): boolean {
  return /\b(U?Int\d*|Float\d*|Decimal|Bool)\b/i.test(type)
}

function pickTable(tables: RawTableRow[], currentDatabase?: string): RawTableRow | undefined {
  const candidates = tables
    .filter((table) => !SYSTEM_DATABASES.has(table.database))
    .sort((a, b) => {
      if (currentDatabase) {
        if (a.database === currentDatabase && b.database !== currentDatabase) return -1
        if (b.database === currentDatabase && a.database !== currentDatabase) return 1
      }

      const rowsA = Number(a.total_rows) || 0
      const rowsB = Number(b.total_rows) || 0
      if (rowsA !== rowsB) return rowsB - rowsA

      return `${a.database}.${a.name}`.localeCompare(`${b.database}.${b.name}`)
    })

  return candidates[0]
}

export function buildStarterQueries(
  tables: RawTableRow[],
  columns: RawColumnRow[],
  currentDatabase?: string,
): StarterQuery[] {
  const table = pickTable(tables, currentDatabase)

  if (!table) {
    return [
      {
        id: 'select-one',
        title: 'Connection smoke test',
        description: 'Verify that query execution works.',
        badge: 'Health',
        sql: 'SELECT 1',
      },
    ]
  }

  const cols = tableColumns(table, columns)
  const ref = tableRef(table)
  const stringCol = cols.find((col) => isStringType(col.type))
  const dateCol = cols.find((col) => isDateType(col.type))
  const numericCol = cols.find((col) => isNumericType(col.type))

  const starters: StarterQuery[] = [
    {
      id: 'browse',
      title: `Browse ${table.name}`,
      description: 'Inspect the first rows and column shape.',
      badge: 'Rows',
      sql: `SELECT *\nFROM ${ref}\nLIMIT 100`,
    },
  ]

  if (stringCol) {
    const col = quoteIdent(stringCol.name)
    starters.push({
      id: 'group-by',
      title: `Top ${stringCol.name}`,
      description: 'Find the most common values in this table.',
      badge: 'Group',
      sql: `SELECT\n  ${col},\n  count() AS rows\nFROM ${ref}\nGROUP BY ${col}\nORDER BY rows DESC\nLIMIT 20`,
    })
  }

  if (dateCol) {
    const col = quoteIdent(dateCol.name)
    starters.push({
      id: 'recent',
      title: `Recent ${table.name}`,
      description: 'See the newest rows by time column.',
      badge: 'Fresh',
      sql: `SELECT *\nFROM ${ref}\nORDER BY ${col} DESC\nLIMIT 100`,
    })
  }

  if (numericCol) {
    const col = quoteIdent(numericCol.name)
    starters.push({
      id: 'profile',
      title: `Profile ${numericCol.name}`,
      description: 'Get a quick numeric distribution.',
      badge: 'Stats',
      sql: `SELECT\n  count() AS rows,\n  min(${col}) AS min_value,\n  avg(${col}) AS avg_value,\n  max(${col}) AS max_value\nFROM ${ref}`,
    })
  }

  return starters.slice(0, 4)
}

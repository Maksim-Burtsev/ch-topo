export interface QueryTableRef {
  database: string
  table: string
  displayName: string
  qualified: boolean
}

const IDENTIFIER_RE = '(?:`(?:``|[^`])+`|[A-Za-z_][\\w]*)'
const TABLE_REF_RE = new RegExp(
  String.raw`\b(?:FROM|JOIN)\s+(?!\()(${IDENTIFIER_RE}(?:\s*\.\s*${IDENTIFIER_RE})?)`,
  'giu',
)

function unquoteIdentifier(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('`') && trimmed.endsWith('`')) {
    return trimmed.slice(1, -1).replaceAll('``', '`')
  }
  return trimmed
}

function normalizeRef(rawRef: string, currentDatabase?: string): QueryTableRef | null {
  const parts = rawRef.split('.').map(unquoteIdentifier)

  if (parts.length === 1) {
    const table = parts[0]
    if (!table || !currentDatabase) return null

    return {
      database: currentDatabase,
      table,
      displayName: `${currentDatabase}.${table}`,
      qualified: false,
    }
  }

  const [database, table] = parts
  if (!database || !table) return null

  return {
    database,
    table,
    displayName: `${database}.${table}`,
    qualified: true,
  }
}

export function extractQueryTableRefs(sql: string, currentDatabase?: string): QueryTableRef[] {
  const refs = new Map<string, QueryTableRef>()

  for (const match of sql.matchAll(TABLE_REF_RE)) {
    const rawRef = match[1]
    if (!rawRef) continue

    const normalized = normalizeRef(rawRef, currentDatabase)
    if (!normalized) continue

    refs.set(`${normalized.database}.${normalized.table}`, normalized)
  }

  return Array.from(refs.values())
}

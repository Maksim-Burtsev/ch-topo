import type { DDLAction } from '@/types'

interface TokenResult {
  value: string
  end: number
}

function skipSpace(sql: string, index: number) {
  let cursor = index
  while (/\s/u.test(sql[cursor] ?? '')) cursor += 1
  return cursor
}

function readQuoted(sql: string, index: number, quote: '`' | '"'): TokenResult | null {
  let cursor = index + 1
  let value = ''

  while (cursor < sql.length) {
    const current = sql[cursor]
    if (current === undefined) return null

    if (current === quote) {
      if (sql[cursor + 1] === quote) {
        value += quote
        cursor += 2
        continue
      }

      return {
        value,
        end: cursor + 1,
      }
    }

    value += current
    cursor += 1
  }

  return null
}

function readIdentifier(sql: string, index: number): TokenResult | null {
  const start = skipSpace(sql, index)
  const current = sql[start]

  if (current === '`' || current === '"') {
    return readQuoted(sql, start, current)
  }

  const match = /^[A-Za-z_][\w$]*/u.exec(sql.slice(start))
  if (!match?.[0]) return null

  return {
    value: match[0],
    end: start + match[0].length,
  }
}

function readQualifiedName(sql: string, index: number): TokenResult | null {
  const first = readIdentifier(sql, index)
  if (!first) return null

  let cursor = skipSpace(sql, first.end)
  if (sql[cursor] !== '.') return first

  const second = readIdentifier(sql, cursor + 1)
  if (!second) return null

  cursor = second.end
  return {
    value: `${first.value}.${second.value}`,
    end: cursor,
  }
}

function consumeKeyword(sql: string, index: number, keyword: string): number | null {
  const start = skipSpace(sql, index)
  const next = sql.slice(start, start + keyword.length)
  const after = sql[start + keyword.length]

  if (next.toUpperCase() !== keyword.toUpperCase()) return null
  if (after && /[A-Za-z0-9_$]/u.test(after)) return null

  return start + keyword.length
}

function consumeKeywordSequence(sql: string, index: number, keywords: string[]): number | null {
  let cursor = index
  for (const keyword of keywords) {
    const next = consumeKeyword(sql, cursor, keyword)
    if (next === null) return null
    cursor = next
  }
  return cursor
}

function consumeOptionalIfExists(sql: string, index: number) {
  return consumeKeywordSequence(sql, index, ['IF', 'EXISTS']) ?? index
}

function consumeOptionalOnCluster(sql: string, index: number) {
  const onIndex = consumeKeywordSequence(sql, index, ['ON', 'CLUSTER'])
  if (onIndex === null) return index

  const cluster = readIdentifier(sql, onIndex)
  return cluster?.end ?? onIndex
}

function isEnd(sql: string, index: number) {
  return skipSpace(sql, index) === sql.length
}

function hasTopLevelComma(sql: string) {
  let depth = 0
  let cursor = 0
  let quote: '`' | '"' | "'" | null = null

  while (cursor < sql.length) {
    const current = sql[cursor]

    if (quote) {
      if (current === quote) {
        if (sql[cursor + 1] === quote) {
          cursor += 2
          continue
        }
        quote = null
      }
      cursor += 1
      continue
    }

    if (current === '`' || current === '"' || current === "'") {
      quote = current
      cursor += 1
      continue
    }

    if (current === '(') depth += 1
    if (current === ')') depth = Math.max(0, depth - 1)
    if (current === ',' && depth === 0) return true

    cursor += 1
  }

  return false
}

function stripColumnTypeModifiers(type: string) {
  const modifierIdx = type.search(
    /\s+(?:COMMENT|CODEC|DEFAULT|MATERIALIZED|ALIAS|TTL|AFTER|FIRST|SETTINGS)\b/i,
  )
  return (modifierIdx === -1 ? type : type.slice(0, modifierIdx)).trim()
}

function parseDropTable(sql: string): DDLAction | null {
  let cursor = consumeKeywordSequence(sql, 0, ['DROP', 'TABLE'])
  if (cursor === null) return null

  cursor = consumeOptionalIfExists(sql, cursor)
  const table = readQualifiedName(sql, cursor)
  if (!table) return null

  cursor = consumeOptionalOnCluster(sql, table.end)
  if (!isEnd(sql, cursor)) return null

  return { type: 'DROP_TABLE', table: table.value }
}

function parseRenameTable(sql: string): DDLAction | null {
  let cursor = consumeKeywordSequence(sql, 0, ['RENAME', 'TABLE'])
  if (cursor === null) return null

  const table = readQualifiedName(sql, cursor)
  if (!table) return null

  cursor = consumeKeyword(sql, table.end, 'TO')
  if (cursor === null) return null

  const newName = readQualifiedName(sql, cursor)
  if (!newName) return null

  cursor = consumeOptionalOnCluster(sql, newName.end)
  if (!isEnd(sql, cursor)) return null

  return { type: 'RENAME_TABLE', table: table.value, newName: newName.value }
}

function parseAlterTable(sql: string): DDLAction | null {
  let cursor = consumeKeywordSequence(sql, 0, ['ALTER', 'TABLE'])
  if (cursor === null) return null

  cursor = consumeOptionalIfExists(sql, cursor)
  const table = readQualifiedName(sql, cursor)
  if (!table) return null

  cursor = consumeOptionalOnCluster(sql, table.end)
  const rest = sql.slice(cursor).trim()
  if (!rest || hasTopLevelComma(rest)) return null

  let actionCursor = 0
  actionCursor = consumeKeywordSequence(rest, actionCursor, ['DROP', 'COLUMN']) ?? -1
  if (actionCursor >= 0) {
    actionCursor = consumeOptionalIfExists(rest, actionCursor)
    const column = readIdentifier(rest, actionCursor)
    if (!column || !isEnd(rest, column.end)) return null
    return { type: 'DROP_COLUMN', table: table.value, column: column.value }
  }

  actionCursor = consumeKeywordSequence(rest, 0, ['RENAME', 'COLUMN']) ?? -1
  if (actionCursor >= 0) {
    actionCursor = consumeOptionalIfExists(rest, actionCursor)
    const oldName = readIdentifier(rest, actionCursor)
    if (!oldName) return null

    actionCursor = consumeKeyword(rest, oldName.end, 'TO') ?? -1
    if (actionCursor < 0) return null

    const newName = readIdentifier(rest, actionCursor)
    if (!newName || !isEnd(rest, newName.end)) return null
    return {
      type: 'RENAME_COLUMN',
      table: table.value,
      oldName: oldName.value,
      newName: newName.value,
    }
  }

  actionCursor = consumeKeywordSequence(rest, 0, ['MODIFY', 'COLUMN']) ?? -1
  if (actionCursor >= 0) {
    actionCursor = consumeOptionalIfExists(rest, actionCursor)
    const column = readIdentifier(rest, actionCursor)
    if (!column) return null

    const newType = stripColumnTypeModifiers(rest.slice(column.end).trim())
    if (!newType) return null
    return { type: 'MODIFY_COLUMN', table: table.value, column: column.value, newType }
  }

  return null
}

/**
 * Parse a DDL SQL statement into a structured DDLAction.
 * Returns null if the SQL is not recognized (no error shown).
 */
export function parseAction(sql: string): DDLAction | null {
  const trimmed = sql.trim().replace(/;\s*$/, '')

  return parseDropTable(trimmed) ?? parseRenameTable(trimmed) ?? parseAlterTable(trimmed)
}

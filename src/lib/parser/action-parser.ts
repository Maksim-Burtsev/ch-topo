import type { DDLAction } from '@/types'

function fqn(db: string | undefined, name: string | undefined): string {
  if (!name) return ''
  return db ? `${db}.${name}` : name
}

/**
 * Parse a DDL SQL statement into a structured DDLAction.
 * Returns null if the SQL is not recognized (no error shown).
 */
export function parseAction(sql: string): DDLAction | null {
  const trimmed = sql.trim().replace(/;\s*$/, '')

  // DROP TABLE [IF EXISTS] [db.]table
  const dropTable = /^\s*DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:`?(\w+)`?\.)?`?(\w+)`?\s*$/i.exec(
    trimmed,
  )
  if (dropTable) {
    return { type: 'DROP_TABLE', table: fqn(dropTable[1], dropTable[2]) }
  }

  // ALTER TABLE [IF EXISTS] [db.]table ...
  const alterMatch = /^\s*ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:`?(\w+)`?\.)?`?(\w+)`?\s+/i.exec(
    trimmed,
  )
  if (!alterMatch) return null

  const table = fqn(alterMatch[1], alterMatch[2])
  const rest = trimmed.slice(alterMatch[0].length)

  // DROP COLUMN [IF EXISTS] col
  const dropCol = /^DROP\s+COLUMN\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?\s*$/i.exec(rest)
  if (dropCol && dropCol[1]) {
    return { type: 'DROP_COLUMN', table, column: dropCol[1] }
  }

  // RENAME COLUMN [IF EXISTS] old TO new
  const renameCol = /^RENAME\s+COLUMN\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?\s+TO\s+`?(\w+)`?\s*$/i.exec(
    rest,
  )
  if (renameCol && renameCol[1] && renameCol[2]) {
    return { type: 'RENAME_COLUMN', table, oldName: renameCol[1], newName: renameCol[2] }
  }

  // MODIFY COLUMN [IF EXISTS] col type [modifiers...]
  const modifyCol = /^MODIFY\s+COLUMN\s+(?:IF\s+EXISTS\s+)?`?(\w+)`?\s+(.+)$/i.exec(rest)
  if (modifyCol && modifyCol[1] && modifyCol[2]) {
    // Extract type: everything up to a known modifier keyword
    let typeStr = modifyCol[2].trim()
    const modifierIdx = typeStr.search(
      /\s+(?:COMMENT|CODEC|DEFAULT|MATERIALIZED|ALIAS|TTL|AFTER|FIRST|SETTINGS)\b/i,
    )
    if (modifierIdx !== -1) {
      typeStr = typeStr.slice(0, modifierIdx)
    }
    typeStr = typeStr.trim()
    if (!typeStr) return null
    return { type: 'MODIFY_COLUMN', table, column: modifyCol[1], newType: typeStr }
  }

  return null
}

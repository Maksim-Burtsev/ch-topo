import { parseMergeTree } from './mergetree-parser'
import { parseMaterializedView } from './mv-parser'
import { emptyParsedTable } from './types'
import type { ParsedTable } from './types'

/**
 * Extract database and table name from CREATE TABLE/VIEW DDL.
 */
function extractTableName(ddl: string): { database: string; name: string } {
  // CREATE [MATERIALIZED] [VIEW|TABLE] [IF NOT EXISTS] [db.]name
  const re =
    /\bCREATE\s+(?:MATERIALIZED\s+)?(?:TABLE|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:`?(\w+)`?\.)?`?(\w+)`?/i
  const match = re.exec(ddl)
  return {
    database: match?.[1] ?? '',
    name: match?.[2] ?? '',
  }
}

/**
 * Normalize engine string: "Replicated*MergeTree" → still recognized as MergeTree family.
 */
function isMergeTreeFamily(engine: string): boolean {
  return /mergetree/i.test(engine)
}

function isMaterializedView(engine: string): boolean {
  return /materializedview/i.test(engine)
}

/**
 * Parse a CREATE TABLE/VIEW query and extract structural metadata.
 *
 * @param createTableQuery - The full DDL string from system.tables.create_table_query
 * @param engine - The engine type from system.tables.engine
 * @param knownColumns - Set of known column names for this table (from system.columns)
 */
export function parseDDL(
  createTableQuery: string,
  engine: string,
  knownColumns: Set<string> = new Set(),
): ParsedTable {
  const base = emptyParsedTable()
  const { database, name } = extractTableName(createTableQuery)
  base.database = database
  base.name = name
  base.engine = engine

  if (isMaterializedView(engine)) {
    const mvResult = parseMaterializedView(createTableQuery, knownColumns)
    return { ...base, ...mvResult, database, name, engine }
  }

  if (isMergeTreeFamily(engine)) {
    const mtResult = parseMergeTree(createTableQuery, knownColumns)
    return { ...base, ...mtResult, database, name, engine }
  }

  // For other engines (Memory, Log, Distributed, etc.) — return bare parsed result
  return base
}

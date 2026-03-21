import { extractColumnRefs } from './extract-columns'
import { emptyParsedTable } from './types'
import type { ParsedTable } from './types'

/**
 * Extract a balanced parenthesized list starting after the given regex match.
 * E.g. for "ORDER BY (a, b, c) TTL ..." returns "a, b, c".
 * If no parentheses, grabs the single token.
 */
function extractAfterKeyword(ddl: string, pattern: RegExp, terminators: RegExp): string | null {
  const match = pattern.exec(ddl)
  if (!match) return null

  const startIdx = match.index + match[0].length
  const rest = ddl.slice(startIdx).trimStart()

  if (rest.startsWith('(')) {
    // Find balanced closing paren
    let depth = 0
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '(') depth++
      else if (rest[i] === ')') {
        depth--
        if (depth === 0) {
          return rest.slice(1, i).trim()
        }
      }
    }
    // Unbalanced — return what we have
    return rest.slice(1).trim()
  }

  // No parens — grab until terminator
  const termMatch = terminators.exec(rest)
  if (termMatch) {
    return rest.slice(0, termMatch.index).trim()
  }
  return rest.trim()
}

/**
 * Split a comma-separated column list, respecting nested parens.
 * "a, b, func(c, d)" → ["a", "b", "func(c, d)"]
 */
function splitColumns(expr: string): string[] {
  const result: string[] = []
  let depth = 0
  let current = ''

  for (const ch of expr) {
    if (ch === '(') {
      depth++
      current += ch
    } else if (ch === ')') {
      depth--
      current += ch
    } else if (ch === ',' && depth === 0) {
      const trimmed = current.trim()
      if (trimmed) result.push(trimmed)
      current = ''
    } else {
      current += ch
    }
  }

  const trimmed = current.trim()
  if (trimmed) result.push(trimmed)
  return result
}

/** Extract bare column identifiers from expressions like "intHash32(user_id)" → "user_id" */
function extractIdentifiers(expr: string): string[] {
  const re = /[a-zA-Z_][a-zA-Z0-9_]*/g
  const matches = expr.match(re)
  return matches ?? []
}

const CLAUSE_TERMINATORS =
  /\b(?:ORDER\s+BY|PARTITION\s+BY|PRIMARY\s+KEY|SAMPLE\s+BY|TTL|SETTINGS|ENGINE)\b/i

export function parseMergeTree(ddl: string, knownColumns: Set<string>): Partial<ParsedTable> {
  const result = emptyParsedTable()

  // ORDER BY
  const orderByExpr = extractAfterKeyword(
    ddl,
    /\bORDER\s+BY\s+/i,
    /\b(?:SAMPLE\s+BY|TTL|SETTINGS|PARTITION\s+BY|PRIMARY\s+KEY)\b/i,
  )
  if (orderByExpr) {
    const parts = splitColumns(orderByExpr)
    for (const part of parts) {
      for (const id of extractIdentifiers(part)) {
        if (knownColumns.has(id) && !result.orderByColumns.includes(id)) {
          result.orderByColumns.push(id)
        }
      }
    }
  }

  // PARTITION BY
  const partitionExpr = extractAfterKeyword(
    ddl,
    /\bPARTITION\s+BY\s+/i,
    /\b(?:ORDER\s+BY|PRIMARY\s+KEY|SAMPLE\s+BY|TTL|SETTINGS)\b/i,
  )
  if (partitionExpr) {
    result.partitionByColumns = extractColumnRefs(partitionExpr, knownColumns)
  }

  // TTL
  const ttlExpr = extractAfterKeyword(
    ddl,
    /\bTTL\s+/i,
    /\b(?:SETTINGS|PARTITION\s+BY|ORDER\s+BY|SAMPLE\s+BY)\b/i,
  )
  if (ttlExpr) {
    result.ttlColumns = extractColumnRefs(ttlExpr, knownColumns)
  }

  // SAMPLE BY
  const sampleExpr = extractAfterKeyword(ddl, /\bSAMPLE\s+BY\s+/i, CLAUSE_TERMINATORS)
  if (sampleExpr) {
    const cols = extractColumnRefs(sampleExpr, knownColumns)
    result.sampleByColumn = cols[0] ?? null
  }

  // SETTINGS
  const settingsMatch = /\bSETTINGS\s+(.+)$/is.exec(ddl)
  if (settingsMatch?.[1]) {
    const pairs = settingsMatch[1].split(',')
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=')
      if (eqIdx > 0) {
        const key = pair.slice(0, eqIdx).trim()
        const val = pair.slice(eqIdx + 1).trim()
        result.settings[key] = val
      }
    }
  }

  return result
}

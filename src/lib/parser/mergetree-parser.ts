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

function findMatchingParen(input: string, openIndex: number): number {
  let depth = 0
  let quote: string | null = null

  for (let i = openIndex; i < input.length; i++) {
    const ch = input[i]

    if (quote) {
      if (ch === quote && input[i + 1] === quote) {
        i++
      } else if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }

    if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }

  return -1
}

function normalizeIdentifier(identifier: string): string {
  if (identifier.startsWith('`') && identifier.endsWith('`')) {
    return identifier.slice(1, -1).replaceAll('``', '`')
  }
  if (identifier.startsWith('"') && identifier.endsWith('"')) {
    return identifier.slice(1, -1).replaceAll('""', '"')
  }
  return identifier
}

function extractProjectionDefinitions(ddl: string): Array<{ name: string; body: string }> {
  const projections: Array<{ name: string; body: string }> = []
  const identifier = '`(?:``|[^`])+`|"(?:[^"]|"")+"|[A-Za-z_][\\w$]*'
  const projectionRe = new RegExp(`\\bPROJECTION\\s+(${identifier})\\s*\\(`, 'gi')
  let match: RegExpExecArray | null

  while ((match = projectionRe.exec(ddl)) !== null) {
    const name = match[1]
    if (!name) continue

    const openIndex = projectionRe.lastIndex - 1
    const closeIndex = findMatchingParen(ddl, openIndex)
    if (closeIndex === -1) continue

    projections.push({
      name: normalizeIdentifier(name),
      body: ddl.slice(openIndex + 1, closeIndex),
    })
    projectionRe.lastIndex = closeIndex + 1
  }

  return projections
}

function findConstraintExpressionEnd(input: string, startIndex: number): number {
  let depth = 0
  let quote: string | null = null

  for (let i = startIndex; i < input.length; i++) {
    const ch = input[i]

    if (quote) {
      if (ch === quote && input[i + 1] === quote) {
        i++
      } else if (ch === quote) {
        quote = null
      }
      continue
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
      continue
    }

    if (ch === '(') {
      depth++
      continue
    }

    if (ch === ')') {
      if (depth === 0) return i
      depth--
      continue
    }

    if (ch === ',' && depth === 0) {
      return i
    }
  }

  return input.length
}

function extractConstraintDefinitions(ddl: string): Array<{ name: string; expression: string }> {
  const constraints: Array<{ name: string; expression: string }> = []
  const identifier = '`(?:``|[^`])+`|"(?:[^"]|"")+"|[A-Za-z_][\\w$]*'
  const constraintRe = new RegExp(`\\bCONSTRAINT\\s+(${identifier})\\s+CHECK\\s+`, 'gi')
  let match: RegExpExecArray | null

  while ((match = constraintRe.exec(ddl)) !== null) {
    const name = match[1]
    if (!name) continue

    const expressionStart = constraintRe.lastIndex
    const expressionEnd = findConstraintExpressionEnd(ddl, expressionStart)
    constraints.push({
      name: normalizeIdentifier(name),
      expression: ddl.slice(expressionStart, expressionEnd).trim(),
    })
    constraintRe.lastIndex = expressionEnd + 1
  }

  return constraints
}

function hasSelectStar(expr: string): boolean {
  return /\bSELECT\s+(?:[A-Za-z_][\w$]*\s*\.\s*)?\*/i.test(expr)
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

  // PROJECTION name (SELECT ...)
  for (const projection of extractProjectionDefinitions(ddl)) {
    const cols = hasSelectStar(projection.body)
      ? Array.from(knownColumns)
      : extractColumnRefs(projection.body, knownColumns)
    if (cols.length > 0) {
      result.projectionColumns[projection.name] = cols
    }
  }

  // CONSTRAINT name CHECK expression
  for (const constraint of extractConstraintDefinitions(ddl)) {
    const cols = extractColumnRefs(constraint.expression, knownColumns)
    if (cols.length > 0) {
      result.constraintColumns[constraint.name] = cols
    }
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

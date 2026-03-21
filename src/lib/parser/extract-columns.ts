const IDENTIFIER_RE = /[a-zA-Z_][a-zA-Z0-9_]*/g

/**
 * Extract column references from an arbitrary SQL expression
 * (TTL, PARTITION BY, DEFAULT, SAMPLE BY, etc.).
 * Filters against knownColumns to avoid capturing SQL keywords and function names.
 */
export function extractColumnRefs(expression: string, knownColumns: Set<string>): string[] {
  const matches = expression.match(IDENTIFIER_RE)
  if (!matches) return []

  const seen = new Set<string>()
  const result: string[] = []

  for (const m of matches) {
    if (knownColumns.has(m) && !seen.has(m)) {
      seen.add(m)
      result.push(m)
    }
  }

  return result
}

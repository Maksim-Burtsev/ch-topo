const MUTATING_SQL_KEYWORDS = [
  'ALTER',
  'ATTACH',
  'CREATE',
  'DELETE',
  'DETACH',
  'DROP',
  'EXCHANGE',
  'GRANT',
  'INSERT',
  'KILL',
  'OPTIMIZE',
  'RENAME',
  'REPLACE',
  'REVOKE',
  'SET',
  'SYSTEM',
  'TRUNCATE',
  'UPDATE',
  'USE',
] as const

const MUTATING_SQL_KEYWORD_SET = new Set<string>(MUTATING_SQL_KEYWORDS)

export type QuerySafetyReason = 'read-only' | 'confirmation-required'

export interface DangerousSqlDetection {
  dangerous: boolean
  keyword?: string
}

export interface QuerySafetyOptions {
  readOnlyMode: boolean
  confirmedMutating?: boolean
}

export type QuerySafetyResult =
  | {
      allowed: true
      dangerous: boolean
      keyword?: string
    }
  | {
      allowed: false
      reason: QuerySafetyReason
      keyword: string
      message: string
    }

function skipLineComment(sql: string, index: number) {
  const newlineIndex = sql.indexOf('\n', index)
  return newlineIndex === -1 ? sql.length : newlineIndex + 1
}

function skipBlockComment(sql: string, index: number) {
  const endIndex = sql.indexOf('*/', index + 2)
  return endIndex === -1 ? sql.length : endIndex + 2
}

function skipQuotedToken(sql: string, index: number) {
  const quote = sql[index]
  if (!quote) return index + 1

  let cursor = index + 1
  while (cursor < sql.length) {
    const current = sql[cursor]

    if (current === '\\') {
      cursor += 2
      continue
    }

    if (current === quote) {
      if (sql[cursor + 1] === quote) {
        cursor += 2
        continue
      }
      return cursor + 1
    }

    cursor += 1
  }

  return sql.length
}

function readKeyword(sql: string, index: number) {
  const match = /^[A-Za-z_]+/u.exec(sql.slice(index))
  if (!match?.[0]) return undefined

  return {
    keyword: match[0].toUpperCase(),
    endIndex: index + match[0].length,
  }
}

function collectStatementKeywords(sql: string) {
  const keywords: string[] = []
  let cursor = 0
  let atStatementStart = true

  while (cursor < sql.length) {
    const current = sql[cursor]
    const next = sql[cursor + 1]

    if (current === ';') {
      atStatementStart = true
      cursor += 1
      continue
    }

    if (/\s/u.test(current ?? '')) {
      cursor += 1
      continue
    }

    if (current === '-' && next === '-') {
      cursor = skipLineComment(sql, cursor + 2)
      continue
    }

    if (current === '#') {
      cursor = skipLineComment(sql, cursor + 1)
      continue
    }

    if (current === '/' && next === '*') {
      cursor = skipBlockComment(sql, cursor)
      continue
    }

    if (current === "'" || current === '"' || current === '`') {
      cursor = skipQuotedToken(sql, cursor)
      atStatementStart = false
      continue
    }

    if (atStatementStart) {
      const token = readKeyword(sql, cursor)
      if (token) {
        keywords.push(token.keyword)
        cursor = token.endIndex
        atStatementStart = false
        continue
      }
    }

    atStatementStart = false
    cursor += 1
  }

  return keywords
}

export function detectDangerousSql(sql: string): DangerousSqlDetection {
  const keywords = collectStatementKeywords(sql)

  for (const keyword of keywords) {
    if (MUTATING_SQL_KEYWORD_SET.has(keyword)) {
      return {
        dangerous: true,
        keyword,
      }
    }
  }

  return {
    dangerous: false,
    keyword: keywords[0],
  }
}

export function validateQuerySafety(sql: string, options: QuerySafetyOptions): QuerySafetyResult {
  const detection = detectDangerousSql(sql)

  if (!detection.dangerous) {
    return {
      allowed: true,
      dangerous: false,
      keyword: detection.keyword,
    }
  }

  const keyword = detection.keyword ?? 'SQL'

  if (options.readOnlyMode) {
    return {
      allowed: false,
      reason: 'read-only',
      keyword,
      message: `Read-only mode blocks ${keyword} queries.`,
    }
  }

  if (!options.confirmedMutating) {
    return {
      allowed: false,
      reason: 'confirmation-required',
      keyword,
      message: `${keyword} queries require explicit confirmation.`,
    }
  }

  return {
    allowed: true,
    dangerous: true,
    keyword,
  }
}

// ── JSON tokenizer for syntax-highlighted rendering ───────────

export type JsonTokenType = 'string' | 'number' | 'boolean' | 'null' | 'key' | 'punctuation'

export interface JsonToken {
  type: JsonTokenType
  value: string
}

export const TOKEN_CLASSES: Record<JsonTokenType, string> = {
  string: 'text-emerald-400',
  number: 'text-blue-400',
  boolean: 'text-blue-400',
  null: 'text-muted-foreground italic',
  key: 'text-foreground',
  punctuation: 'text-muted-foreground',
}

export function tokenizeJson(value: unknown, indent: number = 0): JsonToken[][] {
  const lines: JsonToken[][] = []
  const pad = '  '.repeat(indent)

  if (value === null || value === undefined) {
    lines.push([{ type: 'null', value: 'null' }])
    return lines
  }

  if (typeof value === 'string') {
    lines.push([{ type: 'string', value: JSON.stringify(value) }])
    return lines
  }

  if (typeof value === 'number') {
    lines.push([{ type: 'number', value: String(value) }])
    return lines
  }

  if (typeof value === 'boolean') {
    lines.push([{ type: 'boolean', value: String(value) }])
    return lines
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push([{ type: 'punctuation', value: '[]' }])
      return lines
    }
    lines.push([{ type: 'punctuation', value: '[' }])
    value.forEach((item, i) => {
      const itemLines = tokenizeJson(item, indent + 1)
      itemLines.forEach((tokens, lineIdx) => {
        const prefix: JsonToken[] = [{ type: 'punctuation', value: pad + '  ' }]
        const suffix: JsonToken[] =
          lineIdx === itemLines.length - 1 && i < value.length - 1
            ? [{ type: 'punctuation', value: ',' }]
            : []
        lines.push([...prefix, ...tokens, ...suffix])
      })
    })
    lines.push([{ type: 'punctuation', value: pad + ']' }])
    return lines
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) {
      lines.push([{ type: 'punctuation', value: '{}' }])
      return lines
    }
    lines.push([{ type: 'punctuation', value: '{' }])
    entries.forEach(([key, val], i) => {
      const valLines = tokenizeJson(val, indent + 1)
      const isLast = i === entries.length - 1

      const firstValLine: JsonToken[] = valLines[0] ?? []
      const suffix: JsonToken[] =
        valLines.length === 1 && !isLast ? [{ type: 'punctuation', value: ',' }] : []
      lines.push([
        { type: 'punctuation', value: pad + '  ' },
        { type: 'key', value: JSON.stringify(key) },
        { type: 'punctuation', value: ': ' },
        ...firstValLine,
        ...suffix,
      ])

      for (let li = 1; li < valLines.length; li++) {
        const trailingSuffix: JsonToken[] =
          li === valLines.length - 1 && !isLast ? [{ type: 'punctuation', value: ',' }] : []
        lines.push([...(valLines[li] ?? []), ...trailingSuffix])
      }
    })
    lines.push([{ type: 'punctuation', value: pad + '}' }])
    return lines
  }

  lines.push([{ type: 'string', value: JSON.stringify(value) }])
  return lines
}

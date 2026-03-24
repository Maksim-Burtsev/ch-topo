import { describe, expect, it } from 'vitest'
import { tokenizeJson } from '../json-tokenize'

// ── tokenizeJson ─────────────────────────────────────────────

describe('tokenizeJson', () => {
  it('tokenizes null', () => {
    const lines = tokenizeJson(null)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([{ type: 'null', value: 'null' }])
  })

  it('tokenizes undefined as null', () => {
    const lines = tokenizeJson(undefined)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([{ type: 'null', value: 'null' }])
  })

  it('tokenizes a string', () => {
    const lines = tokenizeJson('hello')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([{ type: 'string', value: '"hello"' }])
  })

  it('tokenizes a number', () => {
    const lines = tokenizeJson(42)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([{ type: 'number', value: '42' }])
  })

  it('tokenizes a boolean', () => {
    const lines = tokenizeJson(true)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([{ type: 'boolean', value: 'true' }])
  })

  it('tokenizes an empty array', () => {
    const lines = tokenizeJson([])
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([{ type: 'punctuation', value: '[]' }])
  })

  it('tokenizes an empty object', () => {
    const lines = tokenizeJson({})
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual([{ type: 'punctuation', value: '{}' }])
  })

  it('tokenizes a flat object', () => {
    const lines = tokenizeJson({ name: 'Alice', age: 30 })
    // { + 2 key-value lines + } = 4 lines
    expect(lines).toHaveLength(4)
    // Opening brace
    expect(lines[0]).toEqual([{ type: 'punctuation', value: '{' }])
    // First key-value
    const firstEntry = lines[1] ?? []
    expect(firstEntry).toContainEqual({ type: 'key', value: '"name"' })
    expect(firstEntry).toContainEqual({ type: 'string', value: '"Alice"' })
    // Trailing comma on first entry
    expect(firstEntry.at(-1)).toEqual({ type: 'punctuation', value: ',' })
    // Second key-value (no trailing comma)
    const secondEntry = lines[2] ?? []
    expect(secondEntry).toContainEqual({ type: 'key', value: '"age"' })
    expect(secondEntry).toContainEqual({ type: 'number', value: '30' })
    expect(secondEntry.at(-1)).not.toEqual({ type: 'punctuation', value: ',' })
    // Closing brace
    expect(lines[3]).toEqual([{ type: 'punctuation', value: '}' }])
  })

  it('tokenizes a simple array', () => {
    const lines = tokenizeJson([1, 2])
    // [ + 2 items + ] = 4 lines
    expect(lines).toHaveLength(4)
    expect(lines[0]).toEqual([{ type: 'punctuation', value: '[' }])
    // First item has comma
    const firstItem = lines[1] ?? []
    expect(firstItem).toContainEqual({ type: 'number', value: '1' })
    expect(firstItem.at(-1)).toEqual({ type: 'punctuation', value: ',' })
    // Second item has no comma
    expect(lines[2]).toContainEqual({ type: 'number', value: '2' })
    expect(lines[3]).toEqual([{ type: 'punctuation', value: ']' }])
  })

  it('tokenizes nested objects with correct indentation', () => {
    const lines = tokenizeJson({ a: { b: 1 } }, 0)
    // { + a: { + b: 1 + } + } = 5 lines
    expect(lines).toHaveLength(5)
    // Inner key line should have deeper indentation
    const innerKeyLine = lines[2] ?? []
    expect(innerKeyLine).toContainEqual({ type: 'key', value: '"b"' })
    expect(innerKeyLine).toContainEqual({ type: 'number', value: '1' })
  })

  it('produces key tokens for object keys', () => {
    const lines = tokenizeJson({ x: 1 })
    const keyTokens = lines.flatMap((line) =>
      line.filter((t) => t.type === 'key'),
    )
    expect(keyTokens).toContainEqual({ type: 'key', value: '"x"' })
  })

  it('handles objects with null values', () => {
    const lines = tokenizeJson({ val: null })
    const nullTokens = lines.flatMap((line) =>
      line.filter((t) => t.type === 'null'),
    )
    expect(nullTokens).toContainEqual({ type: 'null', value: 'null' })
  })

  it('handles mixed array', () => {
    const lines = tokenizeJson([1, 'two', null, true])
    // [ + 4 items + ] = 6 lines
    expect(lines).toHaveLength(6)
    const allTokens = lines.flat()
    expect(allTokens).toContainEqual({ type: 'number', value: '1' })
    expect(allTokens).toContainEqual({ type: 'string', value: '"two"' })
    expect(allTokens).toContainEqual({ type: 'null', value: 'null' })
    expect(allTokens).toContainEqual({ type: 'boolean', value: 'true' })
  })
})

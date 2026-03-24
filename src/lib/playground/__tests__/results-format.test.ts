import { describe, expect, it } from 'vitest'
import type { SortState } from '../results-format'
import {
  compareValues,
  formatCellValue,
  isNullish,
  sortRows,
} from '../results-format'

// ── formatCellValue ─────────────────────────────────────────

describe('formatCellValue', () => {
  it('returns "NULL" for null', () => {
    expect(formatCellValue(null)).toBe('NULL')
  })

  it('returns "NULL" for undefined', () => {
    expect(formatCellValue(undefined)).toBe('NULL')
  })

  it('formats numbers with locale', () => {
    const result = formatCellValue(1234567)
    // Locale-specific, but should contain the digits
    expect(result).toContain('1')
    expect(result).toContain('234')
    expect(result).toContain('567')
  })

  it('formats booleans as strings', () => {
    expect(formatCellValue(true)).toBe('true')
    expect(formatCellValue(false)).toBe('false')
  })

  it('returns strings as-is', () => {
    expect(formatCellValue('hello world')).toBe('hello world')
  })

  it('formats ISO date strings', () => {
    const result = formatCellValue('2024-01-15T10:30:00')
    // Should be formatted by toLocaleString, not the raw ISO string
    expect(result).not.toBe('2024-01-15T10:30:00')
    expect(result).toContain('2024')
  })

  it('formats ISO date strings with space separator', () => {
    const result = formatCellValue('2024-01-15 10:30:00')
    expect(result).toContain('2024')
  })

  it('returns non-date strings unchanged', () => {
    expect(formatCellValue('not-a-date')).toBe('not-a-date')
  })

  it('handles zero', () => {
    expect(formatCellValue(0)).toBe('0')
  })

  it('handles empty string', () => {
    expect(formatCellValue('')).toBe('')
  })

  it('handles objects by JSON stringifying', () => {
    expect(formatCellValue({ a: 1 })).toBe('{"a":1}')
  })

  it('handles arrays by JSON stringifying', () => {
    expect(formatCellValue([1, 2, 3])).toBe('[1,2,3]')
  })
})

// ── isNullish ───────────────────────────────────────────────

describe('isNullish', () => {
  it('returns true for null', () => {
    expect(isNullish(null)).toBe(true)
  })

  it('returns true for undefined', () => {
    expect(isNullish(undefined)).toBe(true)
  })

  it('returns false for 0', () => {
    expect(isNullish(0)).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isNullish('')).toBe(false)
  })

  it('returns false for false', () => {
    expect(isNullish(false)).toBe(false)
  })
})

// ── compareValues ───────────────────────────────────────────

describe('compareValues', () => {
  it('compares numbers correctly', () => {
    expect(compareValues(1, 2)).toBeLessThan(0)
    expect(compareValues(2, 1)).toBeGreaterThan(0)
    expect(compareValues(5, 5)).toBe(0)
  })

  it('compares strings lexicographically', () => {
    expect(compareValues('apple', 'banana')).toBeLessThan(0)
    expect(compareValues('banana', 'apple')).toBeGreaterThan(0)
  })

  it('sorts null values to the end', () => {
    expect(compareValues(null, 'anything')).toBeGreaterThan(0)
    expect(compareValues('anything', null)).toBeLessThan(0)
  })

  it('sorts undefined values to the end', () => {
    expect(compareValues(undefined, 1)).toBeGreaterThan(0)
    expect(compareValues(1, undefined)).toBeLessThan(0)
  })

  it('compares mixed types as strings', () => {
    // string vs non-matching type: both get String()-d
    const result = compareValues('10', '9')
    expect(result).toBeLessThan(0) // "10" < "9" lexicographically
  })
})

// ── sortRows ────────────────────────────────────────────────

describe('sortRows', () => {
  const rows = [
    { name: 'Charlie', age: 30 },
    { name: 'Alice', age: 25 },
    { name: 'Bob', age: 35 },
  ]

  it('returns rows unchanged when sort is null', () => {
    expect(sortRows(rows, null)).toEqual(rows)
  })

  it('sorts ascending by string column', () => {
    const sort: SortState = { column: 'name', direction: 'asc' }
    const sorted = sortRows(rows, sort)
    expect(sorted.map((r) => r.name)).toEqual(['Alice', 'Bob', 'Charlie'])
  })

  it('sorts descending by string column', () => {
    const sort: SortState = { column: 'name', direction: 'desc' }
    const sorted = sortRows(rows, sort)
    expect(sorted.map((r) => r.name)).toEqual(['Charlie', 'Bob', 'Alice'])
  })

  it('sorts ascending by numeric column', () => {
    const sort: SortState = { column: 'age', direction: 'asc' }
    const sorted = sortRows(rows, sort)
    expect(sorted.map((r) => r.age)).toEqual([25, 30, 35])
  })

  it('sorts descending by numeric column', () => {
    const sort: SortState = { column: 'age', direction: 'desc' }
    const sorted = sortRows(rows, sort)
    expect(sorted.map((r) => r.age)).toEqual([35, 30, 25])
  })

  it('does not mutate original array', () => {
    const original = [...rows]
    const sort: SortState = { column: 'name', direction: 'asc' }
    sortRows(rows, sort)
    expect(rows).toEqual(original)
  })

  it('handles null values in sort (pushed to end)', () => {
    const rowsWithNull = [
      { name: 'Bob', value: null },
      { name: 'Alice', value: 10 },
      { name: 'Charlie', value: 5 },
    ]
    const sort: SortState = { column: 'value', direction: 'asc' }
    const sorted = sortRows(rowsWithNull, sort)
    expect(sorted.map((r) => r.value)).toEqual([5, 10, null])
  })
})

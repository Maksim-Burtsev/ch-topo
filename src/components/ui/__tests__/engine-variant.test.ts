import { describe, expect, it } from 'vitest'
import { getEngineVariant } from '../engine-variant'

describe('getEngineVariant', () => {
  it('maps MaterializedView to mv', () => {
    expect(getEngineVariant('MaterializedView')).toBe('mv')
  })

  it('maps AggregatingMergeTree to aggregating', () => {
    expect(getEngineVariant('AggregatingMergeTree')).toBe('aggregating')
  })

  it('maps SummingMergeTree to summing', () => {
    expect(getEngineVariant('SummingMergeTree')).toBe('summing')
  })

  it('maps ReplacingMergeTree to replacing', () => {
    expect(getEngineVariant('ReplacingMergeTree')).toBe('replacing')
  })

  it('maps Distributed to distributed', () => {
    expect(getEngineVariant('Distributed')).toBe('distributed')
  })

  it('maps Dictionary to dictionary', () => {
    expect(getEngineVariant('Dictionary')).toBe('dictionary')
  })

  it('maps MergeTree to mergetree', () => {
    expect(getEngineVariant('MergeTree')).toBe('mergetree')
  })

  it('returns secondary for unknown engines', () => {
    expect(getEngineVariant('Memory')).toBe('secondary')
    expect(getEngineVariant('Buffer')).toBe('secondary')
    expect(getEngineVariant('TinyLog')).toBe('secondary')
  })

  it('is case-insensitive', () => {
    expect(getEngineVariant('mergetree')).toBe('mergetree')
    expect(getEngineVariant('MATERIALIZEDVIEW')).toBe('mv')
    expect(getEngineVariant('distributed')).toBe('distributed')
  })

  it('handles empty string as secondary', () => {
    expect(getEngineVariant('')).toBe('secondary')
  })
})

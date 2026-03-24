import { describe, expect, it } from 'vitest'
import { getEffectiveDatabase } from '../database-utils'

describe('getEffectiveDatabase', () => {
  it('returns empty string when no database selected and multiple databases', () => {
    expect(getEffectiveDatabase('', ['db1', 'db2'])).toBe('')
  })

  it('auto-selects when only one database exists', () => {
    expect(getEffectiveDatabase('', ['analytics'])).toBe('analytics')
  })

  it('returns the selected database when it exists in the list', () => {
    expect(getEffectiveDatabase('db2', ['db1', 'db2', 'db3'])).toBe('db2')
  })

  it('returns empty string when selected database is not in list', () => {
    expect(getEffectiveDatabase('deleted_db', ['db1', 'db2'])).toBe('')
  })

  it('returns empty string when databases list is empty', () => {
    expect(getEffectiveDatabase('', [])).toBe('')
  })

  it('returns empty string when selected db not in empty list', () => {
    expect(getEffectiveDatabase('db1', [])).toBe('')
  })
})

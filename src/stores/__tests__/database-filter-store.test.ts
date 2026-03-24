import { afterEach, describe, expect, it } from 'vitest'
import { useDatabaseFilterStore } from '../database-filter-store'

describe('useDatabaseFilterStore', () => {
  afterEach(() => {
    useDatabaseFilterStore.getState().setSelectedDatabase('')
  })

  it('starts with empty selectedDatabase', () => {
    expect(useDatabaseFilterStore.getState().selectedDatabase).toBe('')
  })

  it('sets selectedDatabase', () => {
    useDatabaseFilterStore.getState().setSelectedDatabase('analytics')
    expect(useDatabaseFilterStore.getState().selectedDatabase).toBe('analytics')
  })

  it('clears selectedDatabase', () => {
    useDatabaseFilterStore.getState().setSelectedDatabase('analytics')
    useDatabaseFilterStore.getState().setSelectedDatabase('')
    expect(useDatabaseFilterStore.getState().selectedDatabase).toBe('')
  })

  it('persists value across getState calls', () => {
    useDatabaseFilterStore.getState().setSelectedDatabase('staging')
    const val1 = useDatabaseFilterStore.getState().selectedDatabase
    const val2 = useDatabaseFilterStore.getState().selectedDatabase
    expect(val1).toBe('staging')
    expect(val2).toBe('staging')
  })
})

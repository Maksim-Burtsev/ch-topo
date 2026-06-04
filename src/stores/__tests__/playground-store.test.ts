import { beforeEach, describe, expect, it } from 'vitest'
import { usePlaygroundStore } from '../playground-store'

function resetStore() {
  usePlaygroundStore.setState({
    sql: '',
    format: 'table',
    editorPct: 40,
    readOnlyMode: true,
  })
}

describe('usePlaygroundStore', () => {
  beforeEach(() => {
    resetStore()
  })

  it('keeps Playground in read-only mode by default', () => {
    expect(usePlaygroundStore.getState().readOnlyMode).toBe(true)
  })

  it('can enable writes explicitly', () => {
    usePlaygroundStore.getState().setReadOnlyMode(false)

    expect(usePlaygroundStore.getState().readOnlyMode).toBe(false)
  })
})

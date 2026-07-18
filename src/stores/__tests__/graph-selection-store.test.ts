import { beforeEach, describe, expect, it } from 'vitest'
import { useGraphSelectionStore } from '../graph-selection-store'

function resetStore() {
  useGraphSelectionStore.setState({
    selectedId: null,
    focusRequestId: 0,
  })
}

describe('useGraphSelectionStore', () => {
  beforeEach(() => {
    resetStore()
  })

  it('selects a graph node without requesting viewport focus', () => {
    useGraphSelectionStore.getState().selectNode('analytics.events')

    expect(useGraphSelectionStore.getState()).toMatchObject({
      selectedId: 'analytics.events',
      focusRequestId: 0,
    })
  })

  it('selects and requests focus for cross-page graph jumps', () => {
    useGraphSelectionStore.getState().selectAndFocus('analytics.events')

    expect(useGraphSelectionStore.getState()).toMatchObject({
      selectedId: 'analytics.events',
      focusRequestId: 1,
    })
  })

  it('keeps focus request history when clearing selection', () => {
    useGraphSelectionStore.getState().selectAndFocus('analytics.events')
    useGraphSelectionStore.getState().clearSelection()

    expect(useGraphSelectionStore.getState()).toMatchObject({
      selectedId: null,
      focusRequestId: 1,
    })
  })
})

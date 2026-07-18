import { create } from 'zustand'

interface GraphSelectionState {
  selectedId: string | null
  focusRequestId: number
  selectNode: (tableId: string) => void
  selectAndFocus: (tableId: string) => void
  clearSelection: () => void
}

export const useGraphSelectionStore = create<GraphSelectionState>((set, get) => ({
  selectedId: null,
  focusRequestId: 0,
  selectNode: (tableId) => {
    set({ selectedId: tableId })
  },
  selectAndFocus: (tableId) => {
    set({ selectedId: tableId, focusRequestId: get().focusRequestId + 1 })
  },
  clearSelection: () => {
    set({ selectedId: null })
  },
}))

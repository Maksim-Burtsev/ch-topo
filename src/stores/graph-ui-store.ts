import { create } from 'zustand'

const STORAGE_KEY = 'chtopo_graph_ui'

interface GraphUiState {
  showMinimap: boolean
  showLegend: boolean
  setShowMinimap: (v: boolean) => void
  setShowLegend: (v: boolean) => void
  toggleMinimap: () => void
  toggleLegend: () => void
}

function load(): { showMinimap: boolean; showLegend: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { showMinimap?: boolean; showLegend?: boolean }
      return {
        showMinimap: parsed.showMinimap ?? true,
        showLegend: parsed.showLegend ?? true,
      }
    }
  } catch {
    // localStorage unavailable
  }
  return { showMinimap: true, showLegend: true }
}

function persist(state: { showMinimap: boolean; showLegend: boolean }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

const initial = load()

export const useGraphUiStore = create<GraphUiState>((set, get) => ({
  showMinimap: initial.showMinimap,
  showLegend: initial.showLegend,
  setShowMinimap: (v) => {
    set({ showMinimap: v })
    persist({ showMinimap: v, showLegend: get().showLegend })
  },
  setShowLegend: (v) => {
    set({ showLegend: v })
    persist({ showMinimap: get().showMinimap, showLegend: v })
  },
  toggleMinimap: () => {
    const next = !get().showMinimap
    set({ showMinimap: next })
    persist({ showMinimap: next, showLegend: get().showLegend })
  },
  toggleLegend: () => {
    const next = !get().showLegend
    set({ showLegend: next })
    persist({ showMinimap: get().showMinimap, showLegend: next })
  },
}))

import { create } from 'zustand'
import { buildDependencyGraph } from '@/lib/graph/build-graph'
import type { DependencyGraph } from '@/lib/graph/types'
import { useSchemaStore } from './schema-store'

type GraphStatus = 'idle' | 'building' | 'ready' | 'error'

interface GraphState {
  graph: DependencyGraph | null
  buildState: GraphStatus
  error: string | null
  buildGraph: () => void
  reset: () => void
}

export const useGraphStore = create<GraphState>((set) => ({
  graph: null,
  buildState: 'idle',
  error: null,

  buildGraph: () => {
    const schema = useSchemaStore.getState()

    set({ buildState: 'building', error: null })

    try {
      const graph = buildDependencyGraph(
        schema.tables,
        schema.columns,
        schema.indices,
        schema.dictionaries,
        schema.rowPolicies,
        schema.grants,
      )
      set({ graph, buildState: 'ready' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to build dependency graph'
      set({ buildState: 'error', error: message })
    }
  },

  reset: () => {
    set({ graph: null, buildState: 'idle', error: null })
  },
}))

// Auto-build when schema store transitions to ready
useSchemaStore.subscribe((state, prev) => {
  if (state.status === 'ready' && prev.status !== 'ready') {
    useGraphStore.getState().buildGraph()
  }
})

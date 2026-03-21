import { create } from 'zustand'
import { fetchDDLHistory } from '@/lib/clickhouse/queries'
import type { ConnectionParams, RawDDLHistoryRow } from '@/lib/clickhouse/types'

type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface HistoryState {
  entries: RawDDLHistoryRow[]
  status: HistoryStatus
  error: string | null
  loadHistory: (params: ConnectionParams) => Promise<void>
  reset: () => void
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  status: 'idle',
  error: null,

  loadHistory: async (params: ConnectionParams) => {
    set({ status: 'loading', error: null })
    try {
      const rows = await fetchDDLHistory(params)
      set({ entries: rows, status: 'ready' })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load DDL history'
      set({ status: 'error', error: message, entries: [] })
    }
  },

  reset: () => {
    set({ entries: [], status: 'idle', error: null })
  },
}))

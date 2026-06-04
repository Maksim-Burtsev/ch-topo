import { create } from 'zustand'
import { fetchServerHistory } from '@/lib/api/history'
import { fetchDDLHistory } from '@/lib/clickhouse/queries'
import type { ConnectionParams, RawDDLHistoryRow } from '@/lib/clickhouse/types'
import type { ConnectionMode } from './connection-store'

type HistoryStatus = 'idle' | 'loading' | 'ready' | 'error'

interface LoadHistoryOptions {
  mode?: ConnectionMode
}

interface HistoryState {
  entries: RawDDLHistoryRow[]
  status: HistoryStatus
  error: string | null
  loadHistory: (params: ConnectionParams, options?: LoadHistoryOptions) => Promise<void>
  reset: () => void
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  status: 'idle',
  error: null,

  loadHistory: async (params: ConnectionParams, options: LoadHistoryOptions = {}) => {
    set({ status: 'loading', error: null })
    try {
      const rows =
        options.mode === 'server' ? await fetchServerHistory() : await fetchDDLHistory(params)
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

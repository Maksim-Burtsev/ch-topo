import { create } from 'zustand'

type ResultFormat = 'table' | 'json'

interface PlaygroundState {
  sql: string
  setSql: (sql: string) => void
  format: ResultFormat
  setFormat: (format: ResultFormat) => void
  toggleFormat: () => void
}

export const usePlaygroundStore = create<PlaygroundState>((set, get) => ({
  sql: '',
  setSql: (sql) => {
    set({ sql })
  },
  format: 'table',
  setFormat: (format) => {
    set({ format })
  },
  toggleFormat: () => {
    set({ format: get().format === 'table' ? 'json' : 'table' })
  },
}))

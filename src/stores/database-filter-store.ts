import { create } from 'zustand'

interface DatabaseFilterState {
  selectedDatabase: string
  setSelectedDatabase: (db: string) => void
}

export const useDatabaseFilterStore = create<DatabaseFilterState>((set) => ({
  selectedDatabase: '',
  setSelectedDatabase: (db) => {
    set({ selectedDatabase: db })
  },
}))

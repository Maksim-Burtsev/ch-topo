import { create } from 'zustand'
import {
  fetchTables,
  fetchColumns,
  fetchIndices,
  fetchDictionaries,
  fetchRowPolicies,
  fetchGrants,
} from '@/lib/clickhouse/queries'
import type {
  ConnectionParams,
  RawTableRow,
  RawColumnRow,
  RawIndexRow,
  RawDictionaryRow,
  RawRowPolicyRow,
  RawGrantRow,
} from '@/lib/clickhouse/types'

type SchemaStatus = 'idle' | 'loading' | 'ready' | 'error'

interface SchemaState {
  status: SchemaStatus
  error: string | null

  tables: RawTableRow[]
  columns: RawColumnRow[]
  indices: RawIndexRow[]
  dictionaries: RawDictionaryRow[]
  rowPolicies: RawRowPolicyRow[]
  grants: RawGrantRow[]

  tablesReady: boolean
  columnsReady: boolean

  loadSchema: (params: ConnectionParams) => Promise<void>
  reset: () => void
}

export const useSchemaStore = create<SchemaState>((set) => ({
  status: 'idle',
  error: null,
  tables: [],
  columns: [],
  indices: [],
  dictionaries: [],
  rowPolicies: [],
  grants: [],
  tablesReady: false,
  columnsReady: false,

  loadSchema: async (params: ConnectionParams) => {
    set({
      status: 'loading',
      error: null,
      tables: [],
      columns: [],
      indices: [],
      dictionaries: [],
      rowPolicies: [],
      grants: [],
      tablesReady: false,
      columnsReady: false,
    })

    try {
      // Fire all queries in parallel.
      // system.tables is critical path — save it as soon as it resolves.
      const tablesPromise = fetchTables(params).then((rows) => {
        set({ tables: rows, tablesReady: true })
        return rows
      })

      const columnsPromise = fetchColumns(params).then((rows) => {
        set({ columns: rows, columnsReady: true })
        return rows
      })

      const indicesPromise = fetchIndices(params)
      const dictsPromise = fetchDictionaries(params)
      const policiesPromise = fetchRowPolicies(params)
      const grantsPromise = fetchGrants(params)

      const [, , indices, dictionaries, rowPolicies, grants] = await Promise.all([
        tablesPromise,
        columnsPromise,
        indicesPromise,
        dictsPromise,
        policiesPromise,
        grantsPromise,
      ])

      set({
        indices,
        dictionaries,
        rowPolicies,
        grants,
        status: 'ready',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load schema'
      set({ status: 'error', error: message })
    }
  },

  reset: () => {
    set({
      status: 'idle',
      error: null,
      tables: [],
      columns: [],
      indices: [],
      dictionaries: [],
      rowPolicies: [],
      grants: [],
      tablesReady: false,
      columnsReady: false,
    })
  },
}))

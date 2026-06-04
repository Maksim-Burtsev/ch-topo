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

export interface SchemaWarning {
  source: 'indices' | 'dictionaries' | 'rowPolicies' | 'grants'
  message: string
}

interface SchemaState {
  status: SchemaStatus
  error: string | null

  tables: RawTableRow[]
  columns: RawColumnRow[]
  indices: RawIndexRow[]
  dictionaries: RawDictionaryRow[]
  rowPolicies: RawRowPolicyRow[]
  grants: RawGrantRow[]
  warnings: SchemaWarning[]

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
  warnings: [],
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
      warnings: [],
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

      const [
        tablesResult,
        columnsResult,
        indicesResult,
        dictionariesResult,
        policiesResult,
        grantsResult,
      ] = await Promise.allSettled([
        tablesPromise,
        columnsPromise,
        indicesPromise,
        dictsPromise,
        policiesPromise,
        grantsPromise,
      ])
      const warnings: SchemaWarning[] = []

      if (tablesResult.status === 'rejected') throw tablesResult.reason
      if (columnsResult.status === 'rejected') throw columnsResult.reason

      set({
        indices: optionalRows('indices', indicesResult, warnings),
        dictionaries: optionalRows('dictionaries', dictionariesResult, warnings),
        rowPolicies: optionalRows('rowPolicies', policiesResult, warnings),
        grants: optionalRows('grants', grantsResult, warnings),
        warnings,
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
      warnings: [],
      tablesReady: false,
      columnsReady: false,
    })
  },
}))

function getErrorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Failed to load optional schema metadata'
}

function optionalRows<T>(
  source: SchemaWarning['source'],
  result: PromiseSettledResult<T[]>,
  warnings: SchemaWarning[],
): T[] {
  if (result.status === 'fulfilled') return result.value

  warnings.push({
    source,
    message: getErrorMessage(result.reason),
  })
  return []
}

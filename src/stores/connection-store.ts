import { create } from 'zustand'
import { ping } from '@/lib/clickhouse/client'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import {
  clearStoredConnection,
  loadStoredConnection,
  saveStoredConnection,
  toConnectionParams,
} from '@/lib/connection-storage'

interface ConnectionState {
  host: string
  port: number
  database: string
  user: string
  password: string
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  connect: (params: ConnectionParams) => Promise<boolean>
  disconnect: () => void
  getParams: () => ConnectionParams
  restoreFromStorage: () => ConnectionParams | null
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  host: 'localhost',
  port: 8123,
  database: 'default',
  user: 'default',
  password: '',
  isConnected: false,
  isConnecting: false,
  error: null,

  connect: async (params: ConnectionParams) => {
    set({ isConnecting: true, error: null })
    try {
      await ping(params)
      set({
        ...params,
        isConnected: true,
        isConnecting: false,
        error: null,
      })
      saveStoredConnection(params)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isConnecting: false, error: message, isConnected: false })
      return false
    }
  },

  disconnect: () => {
    clearStoredConnection()
    set({
      isConnected: false,
      isConnecting: false,
      error: null,
    })
  },

  getParams: () => {
    const s = get()
    return {
      host: s.host,
      port: s.port,
      database: s.database,
      user: s.user,
      password: s.password,
    }
  },

  restoreFromStorage: () => {
    const saved = loadStoredConnection()
    if (!saved) return null
    const params = toConnectionParams(saved)
    set(params)
    return params
  },
}))

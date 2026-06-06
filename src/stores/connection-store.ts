import { create } from 'zustand'
import { connectServerMode, disconnectServerMode } from '@/lib/api/connection'
import { ping } from '@/lib/clickhouse/client'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import {
  clearStoredConnection,
  loadStoredConnection,
  saveStoredConnection,
  toConnectionParams,
} from '@/lib/connection-storage'
import { demoConnectionParams } from '@/lib/mock/demo-schema'

export type ConnectionMode = 'direct' | 'server' | 'demo'

interface ConnectOptions {
  mode?: ConnectionMode
}

interface ConnectionState {
  host: string
  port: number
  database: string
  user: string
  password: string
  mode: ConnectionMode
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  connect: (params: ConnectionParams, options?: ConnectOptions) => Promise<boolean>
  disconnect: () => Promise<void>
  getParams: () => ConnectionParams
  restoreFromStorage: () => ConnectionParams | null
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  host: 'localhost',
  port: 8123,
  database: 'default',
  user: 'default',
  password: '',
  mode: 'direct',
  isConnected: false,
  isConnecting: false,
  error: null,

  connect: async (params: ConnectionParams, options: ConnectOptions = {}) => {
    const mode = options.mode ?? 'direct'
    set({ isConnecting: true, error: null })

    try {
      if (mode === 'demo') {
        set({
          ...demoConnectionParams,
          mode,
          isConnected: true,
          isConnecting: false,
          error: null,
        })
        clearStoredConnection()
        return true
      }

      if (mode === 'server') {
        await connectServerMode(params)
      } else {
        await ping(params)
      }

      const stateParams = mode === 'server' ? { ...params, password: '' } : params

      set({
        ...stateParams,
        mode,
        isConnected: true,
        isConnecting: false,
        error: null,
      })
      saveStoredConnection(stateParams)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({
        isConnecting: false,
        error: message,
        isConnected: false,
        password: mode === 'server' ? '' : get().password,
      })
      return false
    }
  },

  disconnect: async () => {
    const wasServerMode = get().mode === 'server'
    clearStoredConnection()
    set({
      isConnected: false,
      isConnecting: false,
      error: null,
      password: '',
    })

    if (wasServerMode) {
      try {
        await disconnectServerMode()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to disconnect server session'
        set({ error: message })
      }
    }
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
    set({ ...params, mode: 'direct' })
    return params
  },
}))

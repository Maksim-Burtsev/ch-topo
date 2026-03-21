import { create } from 'zustand'
import { ping } from '@/lib/clickhouse/client'
import type { ConnectionParams } from '@/lib/clickhouse/types'

const STORAGE_KEY = 'chtopo_connection'

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

function loadFromStorage(): Partial<ConnectionParams> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<ConnectionParams>
  } catch {
    return null
  }
}

function saveToStorage(params: ConnectionParams) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(params))
}

function clearStorage() {
  localStorage.removeItem(STORAGE_KEY)
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
      saveToStorage(params)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      set({ isConnecting: false, error: message, isConnected: false })
      return false
    }
  },

  disconnect: () => {
    clearStorage()
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
    const saved = loadFromStorage()
    if (!saved || !saved.host) return null
    const params: ConnectionParams = {
      host: saved.host ?? 'localhost',
      port: saved.port ?? 8123,
      database: saved.database ?? 'default',
      user: saved.user ?? 'default',
      password: saved.password ?? '',
    }
    set(params)
    return params
  },
}))

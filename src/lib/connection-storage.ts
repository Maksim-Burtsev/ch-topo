import type { ConnectionParams } from '@/lib/clickhouse/types'

export const CONNECTION_STORAGE_KEY = 'chtopo_connection'

export type StoredConnectionParams = Omit<ConnectionParams, 'password'>

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage
}

function toStoredConnection(params: Partial<ConnectionParams>): StoredConnectionParams | null {
  if (!params.host) return null

  return {
    host: params.host,
    port: params.port ?? 8123,
    database: params.database ?? 'default',
    user: params.user ?? 'default',
  }
}

export function loadStoredConnection(): StoredConnectionParams | null {
  const storage = getStorage()
  if (!storage) return null

  try {
    const raw = storage.getItem(CONNECTION_STORAGE_KEY)
    if (!raw) return null
    return toStoredConnection(JSON.parse(raw) as Partial<ConnectionParams>)
  } catch {
    return null
  }
}

export function saveStoredConnection(params: ConnectionParams) {
  const storage = getStorage()
  const stored = toStoredConnection(params)
  if (!storage || !stored) return

  storage.setItem(CONNECTION_STORAGE_KEY, JSON.stringify(stored))
}

export function clearStoredConnection() {
  getStorage()?.removeItem(CONNECTION_STORAGE_KEY)
}

export function toConnectionParams(
  params: StoredConnectionParams,
  password = '',
): ConnectionParams {
  return {
    ...params,
    password,
  }
}

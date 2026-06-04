import { randomUUID } from 'node:crypto'
import type { BackendClickHouseConnection } from '../clickhouse/types.js'

export interface SessionRecord {
  id: string
  connection: BackendClickHouseConnection
  expiresAt: number
}

export interface InMemorySessionStoreOptions {
  ttlMs?: number
  now?: () => number
  idGenerator?: () => string
}

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000

export class InMemorySessionStore {
  readonly ttlMs: number
  private readonly now: () => number
  private readonly idGenerator: () => string
  private readonly sessions = new Map<string, SessionRecord>()

  constructor(options: InMemorySessionStoreOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS
    this.now = options.now ?? Date.now
    this.idGenerator = options.idGenerator ?? randomUUID
  }

  create(connection: BackendClickHouseConnection): SessionRecord {
    this.cleanupExpired()

    const session: SessionRecord = {
      id: this.idGenerator(),
      connection,
      expiresAt: this.now() + this.ttlMs,
    }

    this.sessions.set(session.id, session)
    return session
  }

  get(id: string): SessionRecord | undefined {
    const session = this.sessions.get(id)

    if (!session) return undefined

    if (session.expiresAt <= this.now()) {
      this.sessions.delete(id)
      return undefined
    }

    return session
  }

  delete(id: string): boolean {
    return this.sessions.delete(id)
  }

  cleanupExpired(): number {
    const now = this.now()
    let deleted = 0

    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id)
        deleted += 1
      }
    }

    return deleted
  }
}

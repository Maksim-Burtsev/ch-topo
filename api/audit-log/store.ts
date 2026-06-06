import { randomUUID } from 'node:crypto'

export type AuditEventKind = 'connect' | 'disconnect' | 'schema' | 'history' | 'query' | 'explain'
export type AuditStatus = 'success' | 'error'

export interface AuditLogEvent {
  event: AuditEventKind
  status: AuditStatus
  durationMs: number
  sessionId?: string
  targetHost?: string
  queryKind?: string
  statusCode?: number
  errorCode?: string
}

export interface AuditLogEntry extends AuditLogEvent {
  id: string
  timestamp: number
}

export interface AuditLog {
  append(event: AuditLogEvent): void
}

export interface InMemoryAuditLogOptions {
  maxEntries?: number
  now?: () => number
  idGenerator?: () => string
}

const DEFAULT_MAX_ENTRIES = 1_000

export class InMemoryAuditLog implements AuditLog {
  private readonly maxEntries: number
  private readonly now: () => number
  private readonly idGenerator: () => string
  private readonly entries: AuditLogEntry[] = []

  constructor(options: InMemoryAuditLogOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES
    this.now = options.now ?? Date.now
    this.idGenerator = options.idGenerator ?? randomUUID
  }

  append(event: AuditLogEvent) {
    this.entries.push({
      ...event,
      id: this.idGenerator(),
      timestamp: this.now(),
    })

    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
  }

  list(): AuditLogEntry[] {
    return this.entries.map((entry) => ({ ...entry }))
  }
}

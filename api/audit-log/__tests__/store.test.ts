import { describe, expect, it } from 'vitest'
import { InMemoryAuditLog } from '../store.js'

describe('InMemoryAuditLog', () => {
  it('stores audit events without mutating caller data', () => {
    const log = new InMemoryAuditLog({
      now: () => 1_000,
      idGenerator: () => 'audit-1',
    })
    const event = {
      event: 'query' as const,
      status: 'success' as const,
      durationMs: 12,
      sessionId: 'session-1',
      targetHost: 'clickhouse.local',
      queryKind: 'SELECT',
    }

    log.append(event)
    event.queryKind = 'ALTER'

    expect(log.list()).toEqual([
      {
        id: 'audit-1',
        timestamp: 1_000,
        event: 'query',
        status: 'success',
        durationMs: 12,
        sessionId: 'session-1',
        targetHost: 'clickhouse.local',
        queryKind: 'SELECT',
      },
    ])
  })

  it('retains only the configured number of recent events', () => {
    const log = new InMemoryAuditLog({
      maxEntries: 2,
      now: () => 1_000,
      idGenerator: () => 'audit-id',
    })

    log.append({ event: 'connect', status: 'success', durationMs: 1, targetHost: 'a' })
    log.append({ event: 'schema', status: 'success', durationMs: 1, targetHost: 'b' })
    log.append({ event: 'history', status: 'success', durationMs: 1, targetHost: 'c' })

    expect(log.list().map((entry) => entry.event)).toEqual(['schema', 'history'])
  })
})

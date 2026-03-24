import { describe, expect, it } from 'vitest'
import type { RawDDLHistoryRow } from '@/lib/clickhouse/types'
import { getAuthor, getOperationVariant, parseEventDate } from '../history-utils'

function makeEntry(overrides: Partial<RawDDLHistoryRow> = {}): RawDDLHistoryRow {
  return {
    event_time: '2026-03-20 14:30:00',
    query: 'CREATE TABLE test (id UInt64) ENGINE = MergeTree()',
    type: 'QueryFinish',
    exception: '',
    query_duration_ms: '42',
    user: '',
    initial_user: '',
    query_kind: 'Create',
    current_database: 'default',
    ...overrides,
  }
}

// ─── getAuthor ────────────────────────────────────────────────────────

describe('getAuthor', () => {
  it('returns initial_user when both initial_user and user are set', () => {
    const entry = makeEntry({ initial_user: 'deploy_bot', user: 'admin' })
    expect(getAuthor(entry)).toBe('deploy_bot')
  })

  it('returns user when initial_user is empty', () => {
    const entry = makeEntry({ initial_user: '', user: 'admin' })
    expect(getAuthor(entry)).toBe('admin')
  })

  it('returns "system" when both user and initial_user are empty', () => {
    const entry = makeEntry({ initial_user: '', user: '' })
    expect(getAuthor(entry)).toBe('system')
  })

  it('returns initial_user when user is empty', () => {
    const entry = makeEntry({ initial_user: 'cluster_user', user: '' })
    expect(getAuthor(entry)).toBe('cluster_user')
  })

  it('returns "system" when both fields are undefined-like empty strings', () => {
    const entry = makeEntry({})
    expect(getAuthor(entry)).toBe('system')
  })
})

// ─── getOperationVariant ──────────────────────────────────────────────

describe('getOperationVariant', () => {
  it('maps Create to mergetree', () => {
    expect(getOperationVariant('Create')).toBe('mergetree')
  })

  it('maps Alter to replacing', () => {
    expect(getOperationVariant('Alter')).toBe('replacing')
  })

  it('maps Drop to destructive', () => {
    expect(getOperationVariant('Drop')).toBe('destructive')
  })

  it('maps Rename to mv', () => {
    expect(getOperationVariant('Rename')).toBe('mv')
  })

  it('defaults unknown operations to mergetree', () => {
    expect(getOperationVariant('Truncate')).toBe('mergetree')
    expect(getOperationVariant('')).toBe('mergetree')
  })
})

// ─── parseEventDate ───────────────────────────────────────────────────

describe('parseEventDate', () => {
  it('parses a space-separated ClickHouse timestamp', () => {
    const d = parseEventDate('2026-03-20 14:30:00')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2) // March = 2
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(14)
    expect(d.getMinutes()).toBe(30)
  })

  it('handles already ISO-formatted strings', () => {
    const d = parseEventDate('2026-03-20T14:30:00')
    expect(d.getFullYear()).toBe(2026)
  })
})

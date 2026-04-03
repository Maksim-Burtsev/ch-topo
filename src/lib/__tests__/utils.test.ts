import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from '../utils'

describe('formatRelativeTime', () => {
  const now = new Date('2026-04-04T12:00:00')

  it('returns seconds ago for very recent', () => {
    const result = formatRelativeTime('2026-04-04 11:59:30', now)
    expect(result.text).toBe('30s ago')
    expect(result.freshness).toBe('fresh')
  })

  it('returns minutes ago', () => {
    const result = formatRelativeTime('2026-04-04 11:45:00', now)
    expect(result.text).toBe('15m ago')
    expect(result.freshness).toBe('fresh')
  })

  it('returns hours ago', () => {
    const result = formatRelativeTime('2026-04-04 06:00:00', now)
    expect(result.text).toBe('6h ago')
    expect(result.freshness).toBe('fresh')
  })

  it('returns days ago and fresh for < 7 days', () => {
    const result = formatRelativeTime('2026-04-01 12:00:00', now)
    expect(result.text).toBe('3d ago')
    expect(result.freshness).toBe('fresh')
  })

  it('returns days ago and stale for 7-30 days', () => {
    const result = formatRelativeTime('2026-03-23 12:00:00', now)
    expect(result.text).toBe('12d ago')
    expect(result.freshness).toBe('stale')
  })

  it('returns date and dead for > 30 days', () => {
    const result = formatRelativeTime('2026-02-15 10:00:00', now)
    expect(result.text).toBe('Feb 15')
    expect(result.freshness).toBe('dead')
  })

  it('includes original date string as title', () => {
    const result = formatRelativeTime('2026-04-04 11:00:00', now)
    expect(result.title).toBe('2026-04-04 11:00:00')
  })
})

import { describe, expect, it } from 'vitest'
import { formatElapsed } from '@/lib/playground/query-stats-format'
import { formatBytes, formatNumber } from '@/lib/utils'

describe('formatElapsed', () => {
  it('shows <1ms for sub-millisecond values', () => {
    expect(formatElapsed(0)).toBe('<1ms')
    expect(formatElapsed(0.0005)).toBe('<1ms')
    expect(formatElapsed(0.0009)).toBe('<1ms')
  })

  it('shows milliseconds for values under 1 second', () => {
    expect(formatElapsed(0.001)).toBe('1ms')
    expect(formatElapsed(0.05)).toBe('50ms')
    expect(formatElapsed(0.123)).toBe('123ms')
    expect(formatElapsed(0.999)).toBe('999ms')
  })

  it('shows seconds with 2 decimal places for values >= 1 second', () => {
    expect(formatElapsed(1)).toBe('1.00s')
    expect(formatElapsed(1.5)).toBe('1.50s')
    expect(formatElapsed(12.345)).toBe('12.35s')
    expect(formatElapsed(100.1)).toBe('100.10s')
  })
})

describe('formatBytes (from utils)', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB')
  })

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB')
  })
})

describe('formatNumber (from utils)', () => {
  it('formats small numbers', () => {
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(999)).toBe('999')
  })

  it('formats thousands', () => {
    expect(formatNumber(1000)).toBe('1.0K')
    expect(formatNumber(1500)).toBe('1.5K')
  })

  it('formats millions', () => {
    expect(formatNumber(1000000)).toBe('1.0M')
    expect(formatNumber(2500000)).toBe('2.5M')
  })

  it('formats billions', () => {
    expect(formatNumber(1000000000)).toBe('1.0B')
  })
})

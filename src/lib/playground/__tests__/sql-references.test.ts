import { describe, expect, it } from 'vitest'
import { extractQueryTableRefs } from '../sql-references'

describe('extractQueryTableRefs', () => {
  it('extracts qualified FROM and JOIN refs', () => {
    const refs = extractQueryTableRefs(
      'SELECT * FROM analytics.events e JOIN marketing.campaigns c ON e.id = c.id',
      'default',
    )

    expect(refs).toEqual([
      {
        database: 'analytics',
        table: 'events',
        displayName: 'analytics.events',
        qualified: true,
      },
      {
        database: 'marketing',
        table: 'campaigns',
        displayName: 'marketing.campaigns',
        qualified: true,
      },
    ])
  })

  it('uses current database for unqualified refs', () => {
    const refs = extractQueryTableRefs('SELECT * FROM events', 'analytics')

    expect(refs).toEqual([
      {
        database: 'analytics',
        table: 'events',
        displayName: 'analytics.events',
        qualified: false,
      },
    ])
  })

  it('handles backtick quoted refs', () => {
    const refs = extractQueryTableRefs('SELECT * FROM `ana``lytics`.`event``log`')

    expect(refs).toEqual([
      {
        database: 'ana`lytics',
        table: 'event`log',
        displayName: 'ana`lytics.event`log',
        qualified: true,
      },
    ])
  })

  it('deduplicates repeated table refs', () => {
    const refs = extractQueryTableRefs(
      'SELECT * FROM analytics.events JOIN analytics.events e2 ON 1',
    )

    expect(refs).toHaveLength(1)
  })

  it('skips subquery FROM clauses without a table token', () => {
    const refs = extractQueryTableRefs('SELECT * FROM (SELECT 1) x JOIN analytics.events e ON 1')

    expect(refs.map((ref) => ref.displayName)).toEqual(['analytics.events'])
  })
})

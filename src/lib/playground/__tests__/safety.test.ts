import { describe, expect, it } from 'vitest'
import { detectDangerousSql, validateQuerySafety } from '../safety'

describe('detectDangerousSql', () => {
  it('allows read-only statements', () => {
    expect(detectDangerousSql('SELECT * FROM events')).toEqual({
      dangerous: false,
      keyword: 'SELECT',
    })
    expect(detectDangerousSql('/* inspect */\nEXPLAIN SELECT 1')).toEqual({
      dangerous: false,
      keyword: 'EXPLAIN',
    })
  })

  it('detects mutating statements after comments and whitespace', () => {
    expect(detectDangerousSql(' -- cleanup\nDROP TABLE events')).toEqual({
      dangerous: true,
      keyword: 'DROP',
    })
  })

  it('detects mutating statements in multi-statement SQL', () => {
    expect(detectDangerousSql("SELECT ';DROP'; INSERT INTO audit VALUES (1)")).toEqual({
      dangerous: true,
      keyword: 'INSERT',
    })
  })
})

describe('validateQuerySafety', () => {
  it('blocks mutating SQL in read-only mode', () => {
    expect(validateQuerySafety('ALTER TABLE events DELETE WHERE id = 1', { readOnlyMode: true }))
      .toMatchInlineSnapshot(`
        {
          "allowed": false,
          "keyword": "ALTER",
          "message": "Read-only mode blocks ALTER queries.",
          "reason": "read-only",
        }
      `)
  })

  it('requires explicit confirmation when writes are enabled', () => {
    expect(validateQuerySafety('TRUNCATE TABLE events', { readOnlyMode: false }))
      .toMatchInlineSnapshot(`
        {
          "allowed": false,
          "keyword": "TRUNCATE",
          "message": "TRUNCATE queries require explicit confirmation.",
          "reason": "confirmation-required",
        }
      `)
  })

  it('allows confirmed mutating SQL when writes are enabled', () => {
    expect(
      validateQuerySafety('INSERT INTO audit VALUES (1)', {
        readOnlyMode: false,
        confirmedMutating: true,
      }),
    ).toEqual({
      allowed: true,
      dangerous: true,
      keyword: 'INSERT',
    })
  })
})

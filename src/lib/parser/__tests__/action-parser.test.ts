import { describe, expect, it } from 'vitest'
import { parseAction } from '../action-parser'

describe('parseAction', () => {
  it('parses DROP TABLE with ON CLUSTER', () => {
    expect(parseAction('DROP TABLE IF EXISTS analytics.events ON CLUSTER prod')).toEqual({
      type: 'DROP_TABLE',
      table: 'analytics.events',
    })
  })

  it('parses ALTER TABLE actions with ON CLUSTER', () => {
    expect(
      parseAction('ALTER TABLE analytics.events ON CLUSTER prod DROP COLUMN IF EXISTS user_id'),
    ).toEqual({
      type: 'DROP_COLUMN',
      table: 'analytics.events',
      column: 'user_id',
    })
  })

  it('parses quoted identifiers beyond word characters', () => {
    expect(parseAction('ALTER TABLE `analytics-db`.`events-v2` DROP COLUMN `user-id`')).toEqual({
      type: 'DROP_COLUMN',
      table: 'analytics-db.events-v2',
      column: 'user-id',
    })
  })

  it('parses RENAME TABLE', () => {
    expect(parseAction('RENAME TABLE analytics.events TO analytics.events_old')).toEqual({
      type: 'RENAME_TABLE',
      table: 'analytics.events',
      newName: 'analytics.events_old',
    })
  })

  it('rejects multi-action ALTER TABLE instead of parsing only the first action', () => {
    expect(
      parseAction('ALTER TABLE analytics.events DROP COLUMN user_id, DROP COLUMN session_id'),
    ).toBeNull()
  })
})

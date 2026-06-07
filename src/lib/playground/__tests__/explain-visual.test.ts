import { describe, expect, it } from 'vitest'
import { parseExplainStages } from '../explain-visual'

describe('parseExplainStages', () => {
  it('classifies plan lines and preserves nesting depth', () => {
    const stages = parseExplainStages(
      [
        'ReadFromMergeTree (analytics.events)',
        '  Expression ((Projection + Before ORDER BY))',
        '  Aggregating',
        'Limit',
      ].join('\n'),
      'plan',
    )

    expect(stages.map((stage) => stage.kind)).toEqual(['read', 'expression', 'aggregate', 'limit'])
    expect(stages.map((stage) => stage.depth)).toEqual([0, 1, 1, 0])
    expect(stages[0]?.tableRefs).toEqual(['analytics.events'])
  })

  it('classifies pipeline transforms', () => {
    const stages = parseExplainStages(
      [
        'ExpressionTransform x 4',
        '  AggregatingTransform x 4',
        '    ReadFromMergeTree analytics.events',
      ].join('\n'),
      'pipeline',
    )

    expect(stages.map((stage) => stage.kind)).toEqual(['expression', 'aggregate', 'read'])
    expect(stages[2]?.tableRefs).toEqual(['analytics.events'])
  })

  it('treats syntax explain as syntax stages', () => {
    const stages = parseExplainStages('SELECT event_type FROM analytics.events LIMIT 5', 'syntax')

    expect(stages).toHaveLength(1)
    expect(stages[0]?.kind).toBe('syntax')
    expect(stages[0]?.tableRefs).toEqual(['analytics.events'])
  })

  it('skips empty lines', () => {
    const stages = parseExplainStages('\nReadFromMergeTree analytics.events\n\nLimit\n', 'plan')

    expect(stages).toHaveLength(2)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildImpactJson,
  buildImpactMarkdown,
  IMPACT_SCOPE_NOTE,
  NO_KNOWN_IMPACTS_TITLE,
} from '../impact-report'

const unsafeExecutionGuarantee = ['Safe', 'to', 'execute'].join(' ')

describe('buildImpactMarkdown', () => {
  it('uses scoped non-guarantee wording when no impacts are found', () => {
    const markdown = buildImpactMarkdown([], 'ALTER TABLE analytics.events DROP COLUMN user_id')

    expect(markdown).toContain(`**${NO_KNOWN_IMPACTS_TITLE}**`)
    expect(markdown).toContain(IMPACT_SCOPE_NOTE)
    expect(markdown).not.toContain(unsafeExecutionGuarantee)
  })

  it('includes the confidence and scope note for non-empty reports', () => {
    const markdown = buildImpactMarkdown(
      [
        {
          severity: 'warning',
          objectName: 'analytics.mv_events',
          objectType: 'mv',
          reason: 'Reads the changed column',
          ddlFragment: 'CREATE MATERIALIZED VIEW analytics.mv_events',
        },
      ],
      'ALTER TABLE analytics.events DROP COLUMN user_id',
    )

    expect(markdown).toContain(IMPACT_SCOPE_NOTE)
    expect(markdown).toContain('### Warning (1)')
    expect(markdown).not.toContain(unsafeExecutionGuarantee)
  })

  it('includes input DDL, affected objects, scope, confidence, and warnings', () => {
    const markdown = buildImpactMarkdown(
      [
        {
          severity: 'break',
          objectName: 'analytics.mv_events',
          objectType: 'mv',
          reason: 'Reads the changed column',
          ddlFragment: 'CREATE MATERIALIZED VIEW analytics.mv_events',
        },
      ],
      'ALTER TABLE analytics.events DROP COLUMN user_id',
      ['Parser warning'],
    )

    expect(markdown).toContain('### Input DDL')
    expect(markdown).toContain('### Affected Objects')
    expect(markdown).toContain('analytics.mv_events')
    expect(markdown).toContain('### Warnings')
    expect(markdown).toContain('Parser warning')
    expect(markdown).toContain('confidence')
    expect(markdown).toContain(IMPACT_SCOPE_NOTE)
  })
})

describe('buildImpactJson', () => {
  it('serializes a stable structured report', () => {
    const json = buildImpactJson(
      [
        {
          severity: 'break',
          objectName: 'analytics.mv_events',
          objectType: 'mv',
          reason: 'Reads the changed column',
          ddlFragment: 'CREATE MATERIALIZED VIEW analytics.mv_events',
        },
      ],
      'ALTER TABLE analytics.events DROP COLUMN user_id',
      ['Parser warning'],
    )

    expect(JSON.parse(json)).toEqual({
      title: 'Impact Analysis',
      inputDdl: 'ALTER TABLE analytics.events DROP COLUMN user_id',
      confidence: 'static-supported-scope',
      scope: IMPACT_SCOPE_NOTE,
      summary: {
        break: 1,
        stale: 0,
        warning: 0,
      },
      affectedObjects: [
        {
          severity: 'break',
          objectType: 'mv',
          objectName: 'analytics.mv_events',
          reason: 'Reads the changed column',
          ddlFragment: 'CREATE MATERIALIZED VIEW analytics.mv_events',
        },
      ],
      warnings: ['Parser warning'],
    })
  })
})

import { describe, expect, it } from 'vitest'
import { buildImpactMarkdown, IMPACT_SCOPE_NOTE, NO_KNOWN_IMPACTS_TITLE } from '../impact-report'

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
})

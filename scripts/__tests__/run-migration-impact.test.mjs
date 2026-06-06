import { describe, expect, it } from 'vitest'
import { getExitCode, renderMarkdownComment, summarizeOutputs } from '../run-migration-impact.mjs'

describe('migration impact GitHub Action report', () => {
  it('renders a PR comment with migration file summaries', () => {
    const outputs = [
      {
        file: 'migrations/001_drop_user_id.sql',
        exitCode: 1,
        output: {
          status: 'fail',
          summary: { total: 1, break: 1, stale: 0, warning: 0 },
          impacts: [
            {
              severity: 'break',
              objectType: 'order_by',
              objectName: 'analytics.events',
              reason: 'Column user_id is part of ORDER BY.',
            },
          ],
        },
      },
      {
        file: 'migrations/002_drop_value.sql',
        exitCode: 0,
        output: {
          status: 'pass',
          summary: { total: 0, break: 0, stale: 0, warning: 0 },
          impacts: [],
        },
      },
    ]

    const summary = summarizeOutputs(outputs)
    const markdown = renderMarkdownComment(outputs, summary)

    expect(summary).toEqual({ files: 2, total: 1, break: 1, stale: 0, warning: 0, errors: 0 })
    expect(getExitCode(outputs, summary)).toBe(1)
    expect(markdown).toContain('<!-- chtopo:migration-impact -->')
    expect(markdown).toContain('migrations/001_drop_user_id.sql')
    expect(markdown).toContain('analytics.events')
    expect(markdown).toContain('Break: 1')
  })

  it('exits 2 when any CLI output is an error', () => {
    const outputs = [
      {
        file: 'migrations/bad.sql',
        exitCode: 2,
        output: {
          status: 'error',
          summary: { total: 0, break: 0, stale: 0, warning: 0 },
          impacts: [],
          error: { message: 'Unsupported migration statement' },
        },
      },
    ]
    const summary = summarizeOutputs(outputs)

    expect(summary.errors).toBe(1)
    expect(getExitCode(outputs, summary)).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'
import scopeDoc from '../../../docs/impact-analysis-scope.md?raw'
import readme from '../../../README.md?raw'
import impactPage from '../../pages/impact-page.tsx?raw'

describe('impact analysis scope documentation', () => {
  it('documents supported actions, unsupported constructs, and false-negative classes', () => {
    expect(scopeDoc).toContain('## Supported DDL Actions')
    expect(scopeDoc).toContain('## Unsupported SQL Constructs')
    expect(scopeDoc).toContain('## Known False-Negative Classes')
    expect(scopeDoc).toContain('ALTER TABLE ... DROP COLUMN')
    expect(scopeDoc).toContain('DROP TABLE')
  })

  it('is linked from README and the Impact page', () => {
    expect(readme).toContain('docs/impact-analysis-scope.md')
    expect(impactPage).toContain('docs/impact-analysis-scope.md')
  })
})

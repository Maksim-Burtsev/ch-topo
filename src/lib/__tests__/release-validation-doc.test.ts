import { describe, expect, it } from 'vitest'
import matrixDoc from '../../../docs/release-validation-matrix.md?raw'
import readme from '../../../README.md?raw'

describe('release validation matrix documentation', () => {
  it('documents the release validation baseline', () => {
    expect(matrixDoc).toContain('## ClickHouse Versions')
    expect(matrixDoc).toContain('## Browser Versions')
    expect(matrixDoc).toContain('## Required ClickHouse Permissions')
    expect(matrixDoc).toContain('## Known Limitations')
    expect(matrixDoc).toContain('24.8')
    expect(matrixDoc).toContain('Chromium')
  })

  it('is linked from README', () => {
    expect(readme).toContain('docs/release-validation-matrix.md')
  })
})

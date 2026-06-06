import { describe, expect, it } from 'vitest'
import checklistDoc from '../../../docs/release-checklist.md?raw'
import readme from '../../../README.md?raw'

describe('release checklist documentation', () => {
  it('documents the final release gates and no-tag-without-evidence rule', () => {
    expect(checklistDoc).toContain('## README Command Verification')
    expect(checklistDoc).toContain('## Fresh Clone Verification')
    expect(checklistDoc).toContain('## Tagging Rule')
    expect(checklistDoc).toContain('Do not create or push a release tag')
    expect(checklistDoc).toContain('make check')
  })

  it('is linked from README', () => {
    expect(readme).toContain('docs/release-checklist.md')
  })
})

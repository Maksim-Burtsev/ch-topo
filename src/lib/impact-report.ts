import type { Impact } from '@/types'

export const NO_KNOWN_IMPACTS_TITLE = 'No known impacts detected within supported scope.'

export const IMPACT_SCOPE_NOTE =
  'Confidence/scope: static schema analysis within currently supported dependencies. This is not an execution-safety guarantee; review unsupported constructs before running DDL.'

export function buildImpactMarkdown(results: Impact[], sql: string): string {
  const lines: string[] = [
    '## Impact Analysis',
    '',
    `\`\`\`sql\n${sql}\n\`\`\``,
    '',
    `> ${IMPACT_SCOPE_NOTE}`,
    '',
  ]

  if (results.length === 0) {
    lines.push(`**${NO_KNOWN_IMPACTS_TITLE}**`)
    return lines.join('\n')
  }

  const groups = [
    { label: 'Breaking', items: results.filter((r) => r.severity === 'break') },
    { label: 'Stale', items: results.filter((r) => r.severity === 'stale') },
    { label: 'Warning', items: results.filter((r) => r.severity === 'warning') },
  ]

  for (const group of groups) {
    if (group.items.length === 0) continue

    lines.push(`### ${group.label} (${group.items.length})`, '')
    for (const impact of group.items) {
      lines.push(`- **${impact.objectName}** (${impact.objectType}): ${impact.reason}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

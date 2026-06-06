import type { Impact } from '@/types'

export const NO_KNOWN_IMPACTS_TITLE = 'No known impacts detected within supported scope.'

export const IMPACT_SCOPE_NOTE =
  'Confidence/scope: static schema analysis within currently supported dependencies. This is not an execution-safety guarantee; review unsupported constructs before running DDL.'

const REPORT_CONFIDENCE = 'static-supported-scope'

export interface ImpactReport {
  title: 'Impact Analysis'
  inputDdl: string
  confidence: typeof REPORT_CONFIDENCE
  scope: typeof IMPACT_SCOPE_NOTE
  summary: Record<Impact['severity'], number>
  affectedObjects: Impact[]
  warnings: string[]
}

export function buildImpactReport(
  results: Impact[],
  sql: string,
  warnings: string[] = [],
): ImpactReport {
  return {
    title: 'Impact Analysis',
    inputDdl: sql,
    confidence: REPORT_CONFIDENCE,
    scope: IMPACT_SCOPE_NOTE,
    summary: {
      break: results.filter((result) => result.severity === 'break').length,
      stale: results.filter((result) => result.severity === 'stale').length,
      warning: results.filter((result) => result.severity === 'warning').length,
    },
    affectedObjects: results,
    warnings,
  }
}

export function buildImpactJson(results: Impact[], sql: string, warnings: string[] = []): string {
  return `${JSON.stringify(buildImpactReport(results, sql, warnings), null, 2)}\n`
}

export function buildImpactMarkdown(
  results: Impact[],
  sql: string,
  warnings: string[] = [],
): string {
  const report = buildImpactReport(results, sql, warnings)
  const lines: string[] = [
    '## Impact Analysis',
    '',
    `- confidence: ${report.confidence}`,
    `- scope: ${report.scope}`,
    '',
    '### Input DDL',
    '',
    `\`\`\`sql\n${sql}\n\`\`\``,
    '',
    `> ${IMPACT_SCOPE_NOTE}`,
    '',
  ]

  if (warnings.length > 0) {
    lines.push('### Warnings', '')
    for (const warning of warnings) {
      lines.push(`- ${warning}`)
    }
    lines.push('')
  }

  if (results.length === 0) {
    lines.push(`**${NO_KNOWN_IMPACTS_TITLE}**`)
    return lines.join('\n')
  }

  lines.push('### Affected Objects', '')

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

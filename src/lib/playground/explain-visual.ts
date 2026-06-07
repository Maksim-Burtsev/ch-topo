import type { ExplainMode } from './explain'

export type ExplainStageKind =
  | 'read'
  | 'join'
  | 'filter'
  | 'expression'
  | 'aggregate'
  | 'sort'
  | 'limit'
  | 'output'
  | 'syntax'
  | 'other'

export interface ExplainStage {
  id: string
  kind: ExplainStageKind
  title: string
  detail: string
  depth: number
  tableRefs: string[]
}

const TABLE_REF_RE = /\b([A-Za-z_][\w]*\.[A-Za-z_][\w]*)\b/g

function classifyLine(line: string, mode: ExplainMode): ExplainStageKind {
  if (mode === 'syntax') return 'syntax'
  if (/\b(ReadFrom|Read|Scan|Source|MergeTree|Storage)/i.test(line)) return 'read'
  if (/\bJoin\b/i.test(line)) return 'join'
  if (/\b(Filter|Where|Prewhere)\b/i.test(line)) return 'filter'
  if (/\b(Expression|Projection|Transform|Function|Calculate)/i.test(line)) return 'expression'
  if (/\b(Aggregat|GroupBy|MergingAggregated)/i.test(line)) return 'aggregate'
  if (/\b(Sort|Order)\b/i.test(line)) return 'sort'
  if (/\b(Limit|Offset)\b/i.test(line)) return 'limit'
  if (/\b(Output|Result|Sink|Format)\b/i.test(line)) return 'output'
  return 'other'
}

function titleForLine(line: string, kind: ExplainStageKind): string {
  const clean = line.replace(/^\W+/u, '').replace(/\s+/g, ' ').trim()

  if (!clean) return 'Plan step'

  const firstToken = clean.match(/^[A-Za-z][A-Za-z0-9_]*/u)?.[0]

  if (firstToken) return firstToken.replace(/([a-z])([A-Z])/g, '$1 $2')

  return kind === 'other' ? 'Plan step' : kind.charAt(0).toUpperCase() + kind.slice(1)
}

function extractTableRefs(line: string): string[] {
  return Array.from(line.matchAll(TABLE_REF_RE), (match) => match[1]).filter(
    (ref): ref is string => typeof ref === 'string',
  )
}

export function parseExplainStages(text: string, mode: ExplainMode): ExplainStage[] {
  return text
    .split('\n')
    .map((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) return null

      const depth = Math.floor((line.length - line.trimStart().length) / 2)
      const kind = classifyLine(trimmed, mode)

      return {
        id: `${index}-${kind}`,
        kind,
        title: titleForLine(trimmed, kind),
        detail: trimmed,
        depth,
        tableRefs: extractTableRefs(trimmed),
      } satisfies ExplainStage
    })
    .filter((stage): stage is ExplainStage => stage !== null)
}

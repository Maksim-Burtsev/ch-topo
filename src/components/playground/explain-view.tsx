import { Check, Copy } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { ExplainMode, ExplainResult } from '@/lib/playground/explain'
import {
  parseExplainStages,
  type ExplainStage,
  type ExplainStageKind,
} from '@/lib/playground/explain-visual'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────

const MODES: { value: ExplainMode; label: string }[] = [
  { value: 'plan', label: 'Plan' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'syntax', label: 'Syntax' },
]

const KIND_LABELS: Record<ExplainStageKind, string> = {
  read: 'Read',
  join: 'Join',
  filter: 'Filter',
  expression: 'Expression',
  aggregate: 'Aggregate',
  sort: 'Sort',
  limit: 'Limit',
  output: 'Output',
  syntax: 'Syntax',
  other: 'Step',
}

const KIND_CLASSES: Record<ExplainStageKind, { dot: string; badge: string; border: string }> = {
  read: {
    dot: 'bg-emerald-400',
    badge: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
    border: 'border-emerald-500/30',
  },
  join: {
    dot: 'bg-cyan-400',
    badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300',
    border: 'border-cyan-500/30',
  },
  filter: {
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
    border: 'border-amber-500/30',
  },
  expression: {
    dot: 'bg-blue-400',
    badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-300',
    border: 'border-blue-500/30',
  },
  aggregate: {
    dot: 'bg-purple-400',
    badge: 'bg-purple-500/10 text-purple-600 dark:text-purple-300',
    border: 'border-purple-500/30',
  },
  sort: {
    dot: 'bg-pink-400',
    badge: 'bg-pink-500/10 text-pink-600 dark:text-pink-300',
    border: 'border-pink-500/30',
  },
  limit: {
    dot: 'bg-lime-400',
    badge: 'bg-lime-500/10 text-lime-600 dark:text-lime-300',
    border: 'border-lime-500/30',
  },
  output: {
    dot: 'bg-sky-400',
    badge: 'bg-sky-500/10 text-sky-600 dark:text-sky-300',
    border: 'border-sky-500/30',
  },
  syntax: {
    dot: 'bg-indigo-400',
    badge: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-300',
    border: 'border-indigo-500/30',
  },
  other: {
    dot: 'bg-muted-foreground',
    badge: 'bg-secondary text-muted-foreground',
    border: 'border-border',
  },
}

// ── Component ─────────────────────────────────────────────────

interface ExplainViewProps {
  result: ExplainResult
  onModeChange: (mode: ExplainMode) => void
  className?: string
}

export function ExplainView({ result, onModeChange, className }: ExplainViewProps) {
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const stages = useMemo(
    () => parseExplainStages(result.text, result.mode),
    [result.text, result.mode],
  )

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result.text).then(
      () => {
        setCopied(true)
        setTimeout(() => {
          setCopied(false)
        }, 1500)
      },
      () => {
        // clipboard write failed
      },
    )
  }, [result.text])

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <TabSelector activeMode={result.mode} onModeChange={onModeChange} />
        {result.text && (
          <div className="flex items-center gap-0.5 rounded-md bg-secondary/50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setShowRaw(false)
              }}
              className={cn(
                'rounded px-2 py-0.5 text-xs transition-colors',
                !showRaw
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Visual
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRaw(true)
              }}
              className={cn(
                'rounded px-2 py-0.5 text-xs transition-colors',
                showRaw
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Raw
            </button>
          </div>
        )}
        <div className="flex-1" />
        {result.text && (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        )}
      </div>

      <div className="overflow-auto">
        <ExplainContent result={result} showRaw={showRaw} stages={stages} />
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

interface TabSelectorProps {
  activeMode: ExplainMode
  onModeChange: (mode: ExplainMode) => void
}

function ExplainContent({
  result,
  showRaw,
  stages,
}: {
  result: ExplainResult
  showRaw: boolean
  stages: ExplainStage[]
}) {
  if (result.error) {
    return <div className="px-3 py-4 text-sm text-destructive">{result.error}</div>
  }

  if (result.text && showRaw) {
    return (
      <pre className="whitespace-pre p-3 text-xs leading-5 font-mono text-foreground">
        {result.text}
      </pre>
    )
  }

  if (result.text && stages.length > 0) {
    return <VisualExplain stages={stages} />
  }

  return (
    <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
      No explain output
    </div>
  )
}

function VisualExplain({ stages }: { stages: ExplainStage[] }) {
  return (
    <div className="p-3">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{stages.length} plan stages</span>
        <span>Read from top to bottom.</span>
      </div>

      <div className="space-y-2">
        {stages.map((stage, index) => (
          <VisualExplainStage key={stage.id} stage={stage} isLast={index === stages.length - 1} />
        ))}
      </div>
    </div>
  )
}

function VisualExplainStage({ stage, isLast }: { stage: ExplainStage; isLast: boolean }) {
  const classes = KIND_CLASSES[stage.kind]

  return (
    <div style={{ marginLeft: stage.depth * 18 }} className="relative">
      {!isLast && (
        <div className="absolute left-3 top-8 h-[calc(100%+0.5rem)] w-px bg-border" aria-hidden />
      )}
      <div
        className={cn(
          'relative flex gap-3 rounded-lg border bg-card/60 p-3 shadow-sm',
          classes.border,
        )}
      >
        <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-full', classes.dot)} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{stage.title}</span>
            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', classes.badge)}>
              {KIND_LABELS[stage.kind]}
            </span>
            {stage.tableRefs.map((ref) => (
              <span
                key={ref}
                className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {ref}
              </span>
            ))}
          </div>
          <div className="truncate font-mono text-xs text-muted-foreground">{stage.detail}</div>
        </div>
      </div>
    </div>
  )
}

function TabSelector({ activeMode, onModeChange }: TabSelectorProps) {
  return (
    <div className="flex items-center gap-0.5 rounded-md bg-secondary/50 p-0.5">
      {MODES.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          onClick={() => {
            onModeChange(value)
          }}
          className={cn(
            'rounded px-2.5 py-0.5 text-xs transition-colors',
            activeMode === value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

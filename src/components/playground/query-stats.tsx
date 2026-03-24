import { Loader2, X } from 'lucide-react'
import type { QueryResult } from '@/lib/playground/execute'
import { formatElapsed } from '@/lib/playground/query-stats-format'
import { cn, formatBytes, formatNumber } from '@/lib/utils'

// ── Types ────────────────────────────────────────────────────

export type QueryState =
  | { status: 'idle' }
  | { status: 'running'; onCancel: () => void }
  | { status: 'success'; result: QueryResult }
  | { status: 'error'; result: QueryResult }

interface QueryStatsProps {
  state: QueryState
  className?: string
}

// ── Component ────────────────────────────────────────────────

export function QueryStats({ state, className }: QueryStatsProps) {
  if (state.status === 'idle') return null

  if (state.status === 'running') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground',
          className,
        )}
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>Executing...</span>
        <button
          type="button"
          onClick={state.onCancel}
          className="ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-3 w-3" />
          Cancel
        </button>
      </div>
    )
  }

  const { result } = state

  if (state.status === 'error' && result.error) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive',
          className,
        )}
      >
        <span className="min-w-0 flex-1 truncate">{result.error}</span>
        {result.errorLine != null && (
          <span className="shrink-0 text-destructive/70">Line {result.errorLine}</span>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border px-3 py-1.5 text-xs text-muted-foreground',
        className,
      )}
    >
      <Stat label="Elapsed" value={formatElapsed(result.elapsed)} />
      <Stat label="Rows read" value={formatNumber(result.rowsRead)} />
      <Stat label="Bytes read" value={formatBytes(result.bytesRead)} />
      <Stat label="Returned" value={result.rows.length.toLocaleString()} />
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-muted-foreground/60">{label}</span>
      <span className="text-foreground">{value}</span>
    </span>
  )
}

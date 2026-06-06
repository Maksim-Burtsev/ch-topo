import { AlertTriangle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SchemaWarning } from '@/stores/schema-store'

type SchemaStatus = 'idle' | 'loading' | 'ready' | 'error'

const sourceLabels: Record<SchemaWarning['source'], string> = {
  indices: 'indices',
  dictionaries: 'dictionaries',
  rowPolicies: 'row policies',
  grants: 'grants',
}

interface SchemaDataNoticeProps {
  status: SchemaStatus
  tablesReady: boolean
  columnsReady: boolean
  warnings: SchemaWarning[]
  className?: string
}

export function SchemaDataNotice({
  status,
  tablesReady,
  columnsReady,
  warnings,
  className,
}: SchemaDataNoticeProps) {
  const isPartialLoading = status === 'loading' && tablesReady
  const hasWarnings = warnings.length > 0

  if (!isPartialLoading && !hasWarnings) return null

  const warningSources = warnings.map((warning) => sourceLabels[warning.source]).join(', ')
  let message = 'Tables are available; columns and dependency metadata may update shortly.'

  if (hasWarnings) {
    message = `Core tables and columns loaded, but ${warningSources} metadata is unavailable.`
  } else if (columnsReady) {
    message = 'Optional dependency metadata is still loading; the view may update shortly.'
  }

  return (
    <div
      className={cn(
        'rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 shadow-sm backdrop-blur dark:text-amber-300',
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {isPartialLoading ? (
          <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
        ) : (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-medium">
            {hasWarnings ? 'Partial schema metadata' : 'Schema metadata still loading'}
          </p>
          <p className="mt-1 leading-relaxed text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  )
}

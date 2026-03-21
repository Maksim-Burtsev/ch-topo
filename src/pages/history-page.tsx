import { AlertTriangle, History } from 'lucide-react'
import { useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { useConnectionStore } from '@/stores/connection-store'
import { useHistoryStore } from '@/stores/history-store'

function SkeletonEntry() {
  return (
    <div className="relative flex gap-4 pb-8 last:pb-0">
      <div className="relative z-10 mt-1.5">
        <div className="h-[10px] w-[10px] rounded-full bg-muted animate-pulse" />
      </div>
      <div className="flex-1 rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="h-4 w-40 rounded bg-muted animate-pulse" />
          <div className="h-4 w-20 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-12 w-full rounded bg-muted/50 animate-pulse" />
      </div>
    </div>
  )
}

export function HistoryPage() {
  const { status, entries, error, loadHistory } = useHistoryStore()

  useEffect(() => {
    if (status === 'idle') {
      const params = useConnectionStore.getState().getParams()
      void loadHistory(params)
    }
  }, [status, loadHistory])

  if (status === 'loading') {
    return (
      <div className="max-w-3xl">
        <p className="mb-6 text-sm text-muted-foreground">
          Recent DDL operations from system.query_log.
        </p>
        <div className="relative">
          <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-0">
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonEntry key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-3xl">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <AlertTriangle size={16} className="mt-0.5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-400">Could not load DDL history</p>
            <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
              {error ?? 'Access to system.query_log may require additional permissions.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <div className="max-w-3xl">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-card">
            <History size={24} className="text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No DDL history found</p>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            ClickHouse may not have query_log enabled, or no DDL operations have been recorded yet.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl">
      <p className="mb-6 text-sm text-muted-foreground">
        Recent DDL operations from system.query_log.
      </p>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-0">
          {entries.map((entry, i) => {
            const isSuccess = entry.type === 'QueryFinish'
            const durationMs = Number(entry.query_duration_ms) || 0

            return (
              <div key={i} className="relative flex gap-4 pb-8 last:pb-0">
                {/* Timeline dot */}
                <div className="relative z-10 mt-1.5">
                  <div
                    className={`h-[10px] w-[10px] rounded-full border-2 ${
                      isSuccess
                        ? 'border-emerald-500 bg-emerald-500/20'
                        : 'border-red-500 bg-red-500/20'
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="flex-1 rounded-lg border border-border bg-card p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{entry.event_time}</span>
                      <Badge variant={isSuccess ? 'mergetree' : 'destructive'}>
                        {isSuccess ? 'applied' : 'failed'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{durationMs}ms</span>
                      <span className="rounded bg-muted px-1.5 py-0.5">{entry.user}</span>
                    </div>
                  </div>
                  <pre className="rounded bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
                    {entry.query}
                  </pre>
                  {entry.exception && (
                    <p className="mt-2 text-xs text-red-400 leading-relaxed">{entry.exception}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

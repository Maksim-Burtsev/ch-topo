import { Badge } from '@/components/ui/badge'
import { mockDDLHistory } from '@/lib/mock/data'

export function HistoryPage() {
  return (
    <div className="max-w-3xl">
      <p className="mb-6 text-sm text-muted-foreground">
        Recent DDL operations from system.query_log.
      </p>

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-[19px] top-2 bottom-2 w-px bg-border" />

        <div className="space-y-0">
          {mockDDLHistory.map((entry, i) => (
            <div key={i} className="relative flex gap-4 pb-8 last:pb-0">
              {/* Timeline dot */}
              <div className="relative z-10 mt-1.5">
                <div
                  className={`h-[10px] w-[10px] rounded-full border-2 ${
                    entry.status === 'applied'
                      ? 'border-emerald-500 bg-emerald-500/20'
                      : 'border-red-500 bg-red-500/20'
                  }`}
                />
              </div>

              {/* Content */}
              <div className="flex-1 rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{entry.timestamp}</span>
                    <Badge variant={entry.status === 'applied' ? 'mergetree' : 'destructive'}>
                      {entry.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{entry.duration_ms}ms</span>
                    <span className="rounded bg-muted px-1.5 py-0.5">{entry.user}</span>
                  </div>
                </div>
                <pre className="rounded bg-muted/50 px-3 py-2 text-xs font-mono text-muted-foreground overflow-x-auto leading-relaxed">
                  {entry.query}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { cn } from '@/lib/utils'
import type { Impact } from '@/types'

const severityConfig = {
  break: {
    label: 'BREAK',
    border: 'border-red-500/40',
    bg: 'bg-red-500/5',
    badge: 'bg-red-500/20 text-red-400',
    dot: 'bg-red-500',
  },
  stale: {
    label: 'STALE',
    border: 'border-amber-500/40',
    bg: 'bg-amber-500/5',
    badge: 'bg-amber-500/20 text-amber-400',
    dot: 'bg-amber-500',
  },
  warning: {
    label: 'WARNING',
    border: 'border-purple-500/40',
    bg: 'bg-purple-500/5',
    badge: 'bg-purple-500/20 text-purple-400',
    dot: 'bg-purple-500',
  },
} as const

interface SeverityCardProps {
  impact: Impact
}

export function SeverityCard({ impact }: SeverityCardProps) {
  const config = severityConfig[impact.severity]

  return (
    <div className={cn('rounded-lg border p-4', config.border, config.bg)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-bold',
                config.badge,
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', config.dot)} />
              {config.label}
            </span>
            <span className="text-xs text-muted-foreground">{impact.objectType}</span>
          </div>
          <p className="text-sm font-medium">{impact.objectName}</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{impact.reason}</p>
        </div>
      </div>
      <pre className="mt-3 rounded bg-muted/50 px-3 py-2 text-xs text-muted-foreground overflow-x-auto">
        {impact.ddlFragment}
      </pre>
    </div>
  )
}

import { Zap } from 'lucide-react'
import { useState } from 'react'
import { SeverityCard } from '@/components/shared/severity-card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { mockImpactResults, mockDropTableImpacts, mockDropEventDateImpacts } from '@/lib/mock/data'
import type { Impact } from '@/types'

const actions = [
  { value: 'drop_user_id', label: 'DROP COLUMN user_id' },
  { value: 'drop_event_date', label: 'DROP COLUMN event_date' },
  { value: 'drop_table_events', label: 'DROP TABLE events' },
] as const

type ActionValue = (typeof actions)[number]['value']

const impactMap: Record<ActionValue, Impact[]> = {
  drop_user_id: mockImpactResults,
  drop_event_date: mockDropEventDateImpacts,
  drop_table_events: mockDropTableImpacts,
}

export function ImpactPage() {
  const [table, setTable] = useState('events')
  const [action, setAction] = useState<ActionValue>('drop_user_id')
  const [results, setResults] = useState<Impact[] | null>(null)

  function analyze() {
    setResults(impactMap[action])
  }

  const breaks = results?.filter((r) => r.severity === 'break') ?? []
  const stales = results?.filter((r) => r.severity === 'stale') ?? []
  const warnings = results?.filter((r) => r.severity === 'warning') ?? []

  return (
    <div className="max-w-3xl">
      <p className="mb-6 text-sm text-muted-foreground">
        Simulate a DDL change and see what breaks before you run it.
      </p>

      <div className="mb-6 flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-xs text-muted-foreground">Table</label>
          <Select
            value={table}
            onChange={(e) => {
              setTable(e.target.value)
            }}
          >
            <option value="events">analytics.events</option>
            <option value="sessions">analytics.sessions</option>
            <option value="users">analytics.users</option>
            <option value="raw_events">analytics.raw_events</option>
          </Select>
        </div>
        <div className="flex-1">
          <label className="mb-1.5 block text-xs text-muted-foreground">Action</label>
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value as ActionValue)
            }}
          >
            {actions.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </Select>
        </div>
        <Button onClick={analyze} className="gap-2">
          <Zap size={14} />
          Analyze
        </Button>
      </div>

      {results && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="flex items-center gap-4 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-xs font-bold text-red-400">
                {breaks.length}
              </span>
              <span className="text-xs text-muted-foreground">Breaking</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-xs font-bold text-amber-400">
                {stales.length}
              </span>
              <span className="text-xs text-muted-foreground">Stale</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500/20 text-xs font-bold text-purple-400">
                {warnings.length}
              </span>
              <span className="text-xs text-muted-foreground">Warning</span>
            </div>
          </div>

          {/* BREAK */}
          {breaks.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-red-400">
                Breaking Changes ({breaks.length})
              </h3>
              <div className="space-y-3">
                {breaks.map((impact, i) => (
                  <SeverityCard key={i} impact={impact} />
                ))}
              </div>
            </div>
          )}

          {/* STALE */}
          {stales.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-400">
                Stale Data ({stales.length})
              </h3>
              <div className="space-y-3">
                {stales.map((impact, i) => (
                  <SeverityCard key={i} impact={impact} />
                ))}
              </div>
            </div>
          )}

          {/* WARNING */}
          {warnings.length > 0 && (
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-purple-400">
                Warnings ({warnings.length})
              </h3>
              <div className="space-y-3">
                {warnings.map((impact, i) => (
                  <SeverityCard key={i} impact={impact} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

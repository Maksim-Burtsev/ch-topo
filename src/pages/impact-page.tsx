import { Zap } from 'lucide-react'
import { useMemo, useState } from 'react'
import { SeverityCard } from '@/components/shared/severity-card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { mockDropEventDateImpacts, mockDropTableImpacts, mockImpactResults } from '@/lib/mock/data'
import { useSchemaStore } from '@/stores/schema-store'
import type { Impact } from '@/types'

type ActionType = 'drop_column' | 'drop_table'

export function ImpactPage() {
  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)

  const [selectedTable, setSelectedTable] = useState('')
  const [actionType, setActionType] = useState<ActionType>('drop_column')
  const [selectedColumn, setSelectedColumn] = useState('')
  const [results, setResults] = useState<Impact[] | null>(null)

  const tableOptions = useMemo(
    () =>
      tables.map((t) => ({ value: `${t.database}.${t.name}`, label: `${t.database}.${t.name}` })),
    [tables],
  )

  const columnOptions = useMemo(() => {
    if (!selectedTable) return []
    const [db, tbl] = selectedTable.split('.')
    return columns
      .filter((c) => c.database === db && c.table === tbl)
      .map((c) => ({ value: c.name, label: c.name }))
  }, [columns, selectedTable])

  function analyze() {
    // TODO: real impact analysis from graph store (iteration 6)
    // For now, match mock data for known scenarios
    if (selectedTable === 'analytics.events') {
      if (actionType === 'drop_table') {
        setResults(mockDropTableImpacts)
        return
      }
      if (selectedColumn === 'user_id') {
        setResults(mockImpactResults)
        return
      }
      if (selectedColumn === 'event_date') {
        setResults(mockDropEventDateImpacts)
        return
      }
    }
    setResults([])
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
            value={selectedTable}
            onChange={(e) => {
              setSelectedTable(e.target.value)
              setSelectedColumn('')
              setResults(null)
            }}
          >
            <option value="">Select table...</option>
            {tableOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex-1">
          <label className="mb-1.5 block text-xs text-muted-foreground">Action</label>
          <Select
            value={actionType}
            onChange={(e) => {
              setActionType(e.target.value as ActionType)
              setResults(null)
            }}
          >
            <option value="drop_column">DROP COLUMN</option>
            <option value="drop_table">DROP TABLE</option>
          </Select>
        </div>

        {actionType === 'drop_column' && (
          <div className="flex-1">
            <label className="mb-1.5 block text-xs text-muted-foreground">Column</label>
            <Select
              value={selectedColumn}
              onChange={(e) => {
                setSelectedColumn(e.target.value)
                setResults(null)
              }}
              disabled={!selectedTable}
            >
              <option value="">Select column...</option>
              {columnOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </div>
        )}

        <Button
          onClick={analyze}
          className="gap-2"
          disabled={!selectedTable || (actionType === 'drop_column' && !selectedColumn)}
        >
          <Zap size={14} />
          Analyze
        </Button>
      </div>

      {results && results.length === 0 && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          No impacts detected for this action.
        </div>
      )}

      {results && results.length > 0 && (
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

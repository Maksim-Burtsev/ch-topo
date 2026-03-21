import { CheckCircle, ClipboardCopy, Zap } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { SeverityCard } from '@/components/shared/severity-card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { analyzeImpact } from '@/lib/graph/impact'
import { parseAction } from '@/lib/parser/action-parser'
import { useGraphStore } from '@/stores/graph-store'
import { useSchemaStore } from '@/stores/schema-store'
import type { DDLAction, Impact } from '@/types'

type InputMode = 'sql' | 'builder'
type ActionType = 'drop_column' | 'modify_column' | 'rename_column' | 'drop_table'

function impactsToMarkdown(results: Impact[], sql: string): string {
  const lines: string[] = ['## Impact Analysis', '', `\`\`\`sql\n${sql}\n\`\`\``, '']
  if (results.length === 0) {
    lines.push('**Safe to execute** — no impacts detected.')
    return lines.join('\n')
  }
  const groups = [
    { label: 'Breaking', items: results.filter((r) => r.severity === 'break') },
    { label: 'Stale', items: results.filter((r) => r.severity === 'stale') },
    { label: 'Warning', items: results.filter((r) => r.severity === 'warning') },
  ]
  for (const g of groups) {
    if (g.items.length === 0) continue
    lines.push(`### ${g.label} (${g.items.length})`, '')
    for (const i of g.items) {
      lines.push(`- **${i.objectName}** (${i.objectType}): ${i.reason}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

export function ImpactPage() {
  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)
  const graph = useGraphStore((s) => s.graph)
  const [searchParams] = useSearchParams()

  const prefillSql = searchParams.get('sql') ?? ''
  const [mode, setMode] = useState<InputMode>('sql')
  const [sqlInput, setSqlInput] = useState(prefillSql)
  const [results, setResults] = useState<Impact[] | null>(null)
  const [copied, setCopied] = useState(false)

  // Builder state
  const [selectedTable, setSelectedTable] = useState('')
  const [actionType, setActionType] = useState<ActionType>('drop_column')
  const [selectedColumn, setSelectedColumn] = useState('')
  const [newType, setNewType] = useState('')
  const [newName, setNewName] = useState('')

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

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
      .map((c) => ({ value: c.name, label: `${c.name} (${c.type})` }))
  }, [columns, selectedTable])

  // ── SQL Live Analysis ──
  const runSqlAnalysis = useCallback(
    (sql: string) => {
      if (!graph || !sql.trim()) {
        setResults(null)
        return
      }
      const action = parseAction(sql)
      if (!action) {
        setResults(null)
        return
      }
      setResults(analyzeImpact(action, graph))
    },
    [graph],
  )

  useEffect(() => {
    if (mode !== 'sql') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      runSqlAnalysis(sqlInput)
    }, 150)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [sqlInput, mode, runSqlAnalysis])

  // ── Builder Analysis ──
  function analyzeFromBuilder() {
    if (!graph) return

    let action: DDLAction | null = null

    switch (actionType) {
      case 'drop_column':
        if (selectedTable && selectedColumn) {
          action = { type: 'DROP_COLUMN', table: selectedTable, column: selectedColumn }
        }
        break
      case 'modify_column':
        if (selectedTable && selectedColumn && newType) {
          action = {
            type: 'MODIFY_COLUMN',
            table: selectedTable,
            column: selectedColumn,
            newType,
          }
        }
        break
      case 'rename_column':
        if (selectedTable && selectedColumn && newName) {
          action = {
            type: 'RENAME_COLUMN',
            table: selectedTable,
            oldName: selectedColumn,
            newName,
          }
        }
        break
      case 'drop_table':
        if (selectedTable) {
          action = { type: 'DROP_TABLE', table: selectedTable }
        }
        break
    }

    if (action) {
      setResults(analyzeImpact(action, graph))
    }
  }

  const handleCopyMarkdown = useCallback(() => {
    if (!results) return
    const md = impactsToMarkdown(results, sqlInput)
    void navigator.clipboard.writeText(md).then(() => {
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    })
  }, [results, sqlInput])

  const needsColumn = actionType !== 'drop_table'
  const needsNewType = actionType === 'modify_column'
  const needsNewName = actionType === 'rename_column'

  const canAnalyze =
    graph &&
    selectedTable &&
    (!needsColumn || selectedColumn) &&
    (!needsNewType || newType) &&
    (!needsNewName || newName)

  const breaks = results?.filter((r) => r.severity === 'break') ?? []
  const stales = results?.filter((r) => r.severity === 'stale') ?? []
  const warnings = results?.filter((r) => r.severity === 'warning') ?? []

  return (
    <div className="max-w-3xl">
      <p className="mb-6 text-sm text-muted-foreground">
        Simulate a DDL change and see what breaks before you run it.
      </p>

      {/* Mode toggle */}
      <div className="mb-4 flex gap-1 rounded-lg border border-border bg-card p-1 w-fit">
        <button
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'sql'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => {
            setMode('sql')
            setResults(null)
          }}
        >
          SQL Input
        </button>
        <button
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === 'builder'
              ? 'bg-accent text-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => {
            setMode('builder')
            setResults(null)
          }}
        >
          Builder
        </button>
      </div>

      {/* SQL Mode */}
      {mode === 'sql' && (
        <div className="mb-6">
          <label className="mb-1.5 block text-xs text-muted-foreground">
            Enter DDL statement (ALTER TABLE ... DROP/MODIFY/RENAME COLUMN or DROP TABLE)
          </label>
          <textarea
            className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none resize-none"
            rows={3}
            placeholder="ALTER TABLE analytics.events DROP COLUMN user_id"
            value={sqlInput}
            onChange={(e) => {
              setSqlInput(e.target.value)
            }}
            spellCheck={false}
          />
          {sqlInput.trim() && !parseAction(sqlInput) && (
            <p className="mt-1 text-xs text-muted-foreground">Waiting for valid DDL...</p>
          )}
        </div>
      )}

      {/* Builder Mode */}
      {mode === 'builder' && (
        <div className="mb-6 space-y-3">
          <div className="flex items-end gap-3">
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
                <option value="modify_column">MODIFY COLUMN</option>
                <option value="rename_column">RENAME COLUMN</option>
                <option value="drop_table">DROP TABLE</option>
              </Select>
            </div>
          </div>

          <div className="flex items-end gap-3">
            {needsColumn && (
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

            {needsNewType && (
              <div className="flex-1">
                <label className="mb-1.5 block text-xs text-muted-foreground">New Type</label>
                <input
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                  placeholder="UInt32"
                  value={newType}
                  onChange={(e) => {
                    setNewType(e.target.value)
                    setResults(null)
                  }}
                />
              </div>
            )}

            {needsNewName && (
              <div className="flex-1">
                <label className="mb-1.5 block text-xs text-muted-foreground">New Name</label>
                <input
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none"
                  placeholder="new_column_name"
                  value={newName}
                  onChange={(e) => {
                    setNewName(e.target.value)
                    setResults(null)
                  }}
                />
              </div>
            )}

            <Button onClick={analyzeFromBuilder} className="gap-2" disabled={!canAnalyze}>
              <Zap size={14} />
              Analyze
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {results !== null && results.length === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-6">
          <CheckCircle size={20} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-emerald-400">
              No dependencies affected. Safe to execute.
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No impacts detected for this action.
            </p>
          </div>
        </div>
      )}

      {results !== null && results.length > 0 && (
        <div className="space-y-6">
          {/* Summary counter */}
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
            <div className="ml-auto">
              <Button variant="ghost" size="sm" onClick={handleCopyMarkdown} className="gap-1.5">
                <ClipboardCopy size={14} />
                {copied ? 'Copied!' : 'Copy as Markdown'}
              </Button>
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

import { GitCompareArrows, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  buildSchemaDiff,
  buildSchemaSnapshot,
  clearSchemaSnapshot,
  loadSchemaSnapshot,
  saveSchemaSnapshot,
  type SchemaDiff,
  type SchemaDiffChangedItem,
  type SchemaDiffItem,
  type SchemaSnapshot,
} from '@/lib/schema-snapshot'
import { useSchemaStore } from '@/stores/schema-store'

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function diffCount(diff: SchemaDiff): number {
  return (
    diff.addedTables.length +
    diff.removedTables.length +
    diff.changedTables.length +
    diff.addedColumns.length +
    diff.removedColumns.length +
    diff.changedColumns.length
  )
}

function DiffList({ title, items }: { title: string; items: SchemaDiffItem[] }) {
  if (items.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((item) => (
          <div key={item.name} className="px-3 py-2 font-mono text-xs">
            {item.name}
          </div>
        ))}
      </div>
    </section>
  )
}

function ChangedList({ title, items }: { title: string; items: SchemaDiffChangedItem[] }) {
  if (items.length === 0) return null

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</h3>
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {items.map((item) => (
          <div key={item.name} className="px-3 py-2">
            <div className="font-mono text-xs font-medium">{item.name}</div>
            <div className="mt-1 space-y-1">
              {item.changes.map((change) => (
                <div key={change.field} className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{change.field}</span>:{' '}
                  <span className="font-mono">{change.before || '(empty)'}</span>
                  {' -> '}
                  <span className="font-mono">{change.after || '(empty)'}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function SnapshotsPage() {
  const tables = useSchemaStore((state) => state.tables)
  const columns = useSchemaStore((state) => state.columns)
  const tablesReady = useSchemaStore((state) => state.tablesReady)
  const columnsReady = useSchemaStore((state) => state.columnsReady)
  const [savedSnapshot, setSavedSnapshot] = useState<SchemaSnapshot | null>(() =>
    loadSchemaSnapshot(),
  )

  const currentSnapshot = useMemo(() => buildSchemaSnapshot({ tables, columns }), [tables, columns])
  const diff = useMemo(
    () => (savedSnapshot ? buildSchemaDiff(savedSnapshot, currentSnapshot) : null),
    [savedSnapshot, currentSnapshot],
  )
  const totalChanges = diff ? diffCount(diff) : 0
  const canSave = tablesReady && columnsReady

  function handleSave() {
    const nextSnapshot = buildSchemaSnapshot({ tables, columns })
    if (saveSchemaSnapshot(nextSnapshot)) {
      setSavedSnapshot(nextSnapshot)
    }
  }

  function handleClear() {
    clearSchemaSnapshot()
    setSavedSnapshot(null)
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Compare the current loaded schema with a local sanitized baseline.
          </p>
          {savedSnapshot && (
            <p className="mt-1 text-xs text-muted-foreground">
              Baseline saved {formatDate(savedSnapshot.createdAt)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSave} disabled={!canSave}>
            <Save size={14} />
            Save Snapshot
          </Button>
          <Button size="sm" variant="ghost" onClick={handleClear} disabled={!savedSnapshot}>
            <Trash2 size={14} />
            Clear
          </Button>
        </div>
      </div>

      {!savedSnapshot && (
        <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
          No baseline snapshot saved.
        </div>
      )}

      {savedSnapshot && diff && totalChanges === 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-5 text-sm text-emerald-500">
          <GitCompareArrows size={18} />
          No schema differences from the saved snapshot.
        </div>
      )}

      {savedSnapshot && diff && totalChanges > 0 && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <span className="font-medium">{totalChanges}</span>{' '}
            <span className="text-muted-foreground">schema changes detected</span>
          </div>
          <DiffList title="Added tables" items={diff.addedTables} />
          <DiffList title="Removed tables" items={diff.removedTables} />
          <ChangedList title="Changed tables" items={diff.changedTables} />
          <DiffList title="Added columns" items={diff.addedColumns} />
          <DiffList title="Removed columns" items={diff.removedColumns} />
          <ChangedList title="Changed columns" items={diff.changedColumns} />
        </div>
      )}
    </div>
  )
}

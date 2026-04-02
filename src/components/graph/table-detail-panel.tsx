import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Key,
  Shield,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { RawColumnRow, RawIndexRow, RawTableRow } from '@/lib/clickhouse/types'
import type { DependencyGraph } from '@/lib/graph/types'
import { cn, formatBytes, formatNumber } from '@/lib/utils'

interface TableDetailPanelProps {
  tableId: string
  table: RawTableRow
  columns: RawColumnRow[]
  indices: RawIndexRow[]
  graph: DependencyGraph | null
  onClose: () => void
  onNavigate: (tableId: string) => void
}

function Section({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-border">
      <button
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => {
          setOpen(!open)
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
        {count != null && (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px]">{count}</span>
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

function DepLink({ name, type, onClick }: { name: string; type: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 w-full rounded px-2 py-1 text-xs hover:bg-accent transition-colors text-left"
    >
      {type === 'reads' || type === 'source' ? (
        <ArrowUpRight size={12} className="text-purple-400 shrink-0" />
      ) : (
        <ArrowDownRight size={12} className="text-red-400 shrink-0" />
      )}
      <span className="truncate">{name}</span>
      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">{type}</span>
    </button>
  )
}

export function TableDetailPanel({
  tableId,
  table,
  columns,
  indices,
  graph,
  onClose,
  onNavigate,
}: TableDetailPanelProps) {
  const isMV = /materializedview/i.test(table.engine)
  const rows = Number(table.total_rows) || 0
  const bytes = Number(table.total_bytes) || 0

  // Structure from graph
  const orderBy = graph?.orderByColumns.get(tableId) ?? []
  const partitionBy = graph?.partitionByColumns.get(tableId) ?? []
  const ttl = graph?.ttlExprColumns.get(tableId) ?? []
  const sampleBy = graph?.sampleByColumn.get(tableId) ?? null

  // MV dependencies
  const mvRefs: { mvName: string; direction: string }[] = []
  if (graph) {
    // MVs that read FROM this table
    for (const [mv, sources] of graph.mvSources) {
      if (sources.includes(tableId)) {
        mvRefs.push({ mvName: mv, direction: 'reads' })
      }
    }
    // If this IS an MV, show source and target
    if (isMV) {
      const sources = graph.mvSources.get(tableId) ?? []
      for (const src of sources) {
        mvRefs.push({ mvName: src, direction: 'source' })
      }
      const target = graph.mvTargets.get(tableId)
      if (target) {
        mvRefs.push({ mvName: target, direction: 'target' })
      }
    }
    // MV target: if this table is a target of some MV
    for (const [mv, target] of graph.mvTargets) {
      if (target === tableId) {
        mvRefs.push({ mvName: mv, direction: 'writes to' })
      }
    }
  }

  // Distributed / Buffer deps
  const tableDeps: { name: string; type: string }[] = []
  if (graph) {
    for (const [dist, local] of graph.distributedTables) {
      if (dist === tableId) tableDeps.push({ name: local, type: 'local table' })
      if (local === tableId) tableDeps.push({ name: dist, type: 'Distributed' })
    }
    for (const [buf, dest] of graph.bufferTables) {
      if (buf === tableId) tableDeps.push({ name: dest, type: 'destination' })
      if (dest === tableId) tableDeps.push({ name: buf, type: 'Buffer' })
    }
  }

  // Column MV badge counts
  const colMVCounts = new Map<string, number>()
  if (graph) {
    for (const [colKey, refs] of graph.columnToMVs) {
      if (colKey.startsWith(`${tableId}.`)) {
        const colName = colKey.slice(tableId.length + 1)
        const uniqueMVs = new Set(refs.map((r) => r.mvName))
        colMVCounts.set(colName, uniqueMVs.size)
      }
    }
  }

  // Grants
  const colGrants = new Map<string, string[]>()
  if (graph) {
    for (const [colKey, roles] of graph.columnGrants) {
      if (colKey.startsWith(`${tableId}.`)) {
        const colName = colKey.slice(tableId.length + 1)
        colGrants.set(colName, roles)
      }
    }
  }

  // Row policies
  const policies: { name: string; columns: string[] }[] = []
  if (graph) {
    for (const [name, dep] of graph.rowPolicies) {
      if (dep.table === tableId) {
        policies.push({ name, columns: dep.columns })
      }
    }
  }

  // Table indices
  const tableIndices = indices.filter((idx) => `${idx.database}.${idx.table}` === tableId)

  const allDeps = [...mvRefs.map((r) => ({ name: r.mvName, type: r.direction })), ...tableDeps]

  return (
    <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-border">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold overflow-x-auto whitespace-nowrap scrollbar-none">
            {table.name}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">{table.database}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
              {table.engine}
            </span>
            {rows > 0 && <span>{formatNumber(rows)} rows</span>}
            {bytes > 0 && <span>{formatBytes(bytes)}</span>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Structure */}
        {(orderBy.length > 0 || partitionBy.length > 0 || ttl.length > 0 || sampleBy) && (
          <Section title="Structure" defaultOpen>
            <div className="space-y-1.5 text-xs">
              {orderBy.length > 0 && (
                <div>
                  <span className="text-muted-foreground">ORDER BY </span>
                  <span className="font-mono text-[11px]">({orderBy.join(', ')})</span>
                </div>
              )}
              {partitionBy.length > 0 && (
                <div>
                  <span className="text-muted-foreground">PARTITION BY </span>
                  <span className="font-mono text-[11px]">{partitionBy.join(', ')}</span>
                </div>
              )}
              {ttl.length > 0 && (
                <div>
                  <span className="text-muted-foreground">TTL </span>
                  <span className="font-mono text-[11px]">{ttl.join(', ')}</span>
                </div>
              )}
              {sampleBy && (
                <div>
                  <span className="text-muted-foreground">SAMPLE BY </span>
                  <span className="font-mono text-[11px]">{sampleBy}</span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Columns */}
        <Section title="Columns" count={columns.length} defaultOpen={columns.length <= 15}>
          <div className="space-y-0.5">
            {columns.map((col) => {
              const mvCount = colMVCounts.get(col.name)
              const isOrderBy = orderBy.includes(col.name)
              return (
                <div
                  key={col.name}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent/50"
                >
                  <span className={cn('truncate', isOrderBy && 'font-medium')}>{col.name}</span>
                  {isOrderBy && <Key size={10} className="text-amber-400 shrink-0" />}
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono shrink-0">
                    {col.type}
                  </span>
                  {mvCount && (
                    <span className="rounded bg-purple-500/20 px-1 py-0.5 text-[9px] text-purple-400 shrink-0">
                      {mvCount} MV
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        {/* Dependencies */}
        {allDeps.length > 0 && (
          <Section title="Dependencies" count={allDeps.length} defaultOpen>
            <div className="space-y-0.5">
              {allDeps.map((dep) => (
                <DepLink
                  key={`${dep.name}-${dep.type}`}
                  name={dep.name}
                  type={dep.type}
                  onClick={() => {
                    onNavigate(dep.name)
                  }}
                />
              ))}
            </div>
          </Section>
        )}

        {/* Indexes */}
        {tableIndices.length > 0 && (
          <Section title="Indexes" count={tableIndices.length}>
            <div className="space-y-1">
              {tableIndices.map((idx) => (
                <div key={idx.name} className="flex items-center gap-2 text-xs px-2 py-1">
                  <span className="font-medium">{idx.name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{idx.type}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Access */}
        {(colGrants.size > 0 || policies.length > 0) && (
          <Section title="Access" count={colGrants.size + policies.length}>
            <div className="space-y-1.5 text-xs">
              {[...colGrants.entries()].map(([, roles]) =>
                roles.map((role) => (
                  <div key={role} className="flex items-center gap-2 px-2 py-1">
                    <Shield size={10} className="text-blue-400 shrink-0" />
                    <span>{role}</span>
                  </div>
                )),
              )}
              {policies.map((p) => (
                <div key={p.name} className="flex items-center gap-2 px-2 py-1">
                  <Shield size={10} className="text-amber-400 shrink-0" />
                  <span className="truncate">{p.name}</span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

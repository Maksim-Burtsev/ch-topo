import { ChevronRight, Loader2 } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { MetricCard } from '@/components/shared/metric-card'
import { Badge } from '@/components/ui/badge'
import { getEngineVariant } from '@/components/ui/engine-variant'
import { formatBytes, formatNumber } from '@/lib/utils'
import { useGraphStore } from '@/stores/graph-store'
import { useSchemaStore } from '@/stores/schema-store'

export function TableDetailPage() {
  const { database, name } = useParams<{ database: string; name: string }>()
  const navigate = useNavigate()

  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)
  const columnsReady = useSchemaStore((s) => s.columnsReady)
  const graph = useGraphStore((s) => s.graph)

  const table = tables.find((t) => t.database === database && t.name === name)

  const tableColumns = useMemo(
    () => columns.filter((c) => c.database === database && c.table === name),
    [columns, database, name],
  )

  const mvCounts = useMemo(() => {
    if (!graph || !database || !name) return new Map<string, number>()
    const counts = new Map<string, number>()
    for (const col of tableColumns) {
      const key = `${database}.${name}.${col.name}`
      const refs = graph.columnToMVs.get(key)
      if (refs && refs.length > 0) {
        counts.set(col.name, refs.length)
      }
    }
    return counts
  }, [graph, database, name, tableColumns])

  if (!table) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Table not found
      </div>
    )
  }

  const totalBytes = Number(table.total_bytes) || 0
  const compressedBytes = Number(table.data_compressed_bytes) || 0
  const compression =
    totalBytes > 0 ? ((compressedBytes / totalBytes) * 100).toFixed(1) + '%' : '\u2014'

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-1.5 text-sm">
        <button
          onClick={() => {
            void navigate('/tables')
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Tables
        </button>
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="text-muted-foreground">{database}</span>
        <ChevronRight size={14} className="text-muted-foreground" />
        <span className="font-medium">{name}</span>
        <Badge variant={getEngineVariant(table.engine)} className="ml-2">
          {table.engine}
        </Badge>
      </nav>

      {/* Metric cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard label="Rows" value={formatNumber(Number(table.total_rows) || 0)} />
        <MetricCard
          label="Disk Size"
          value={formatBytes(totalBytes)}
          sub={compressedBytes > 0 ? `Compressed: ${formatBytes(compressedBytes)}` : undefined}
        />
        <MetricCard label="Compression" value={compression} sub="compressed / raw" />
        <MetricCard label="Last Modified" value={table.metadata_modification_time || '\u2014'} />
      </div>

      {/* Columns table */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium">
          Columns {columnsReady ? `(${tableColumns.length})` : ''}
        </h2>
        {!columnsReady ? (
          <div className="flex items-center justify-center h-32 rounded-lg border border-border">
            <Loader2 size={20} className="animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                    Codec
                  </th>
                  <th className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                    Default
                  </th>
                  <th className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                    Used by
                  </th>
                </tr>
              </thead>
              <tbody>
                {tableColumns.map((col) => {
                  const mvCount = mvCounts.get(col.name)
                  return (
                    <tr
                      key={col.name}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 font-mono text-xs font-medium">{col.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {col.type}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {col.compression_codec || '\u2014'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                        {col.default_expression
                          ? `${col.default_kind} ${col.default_expression}`
                          : '\u2014'}
                      </td>
                      <td className="px-4 py-2.5">
                        {mvCount ? (
                          <Badge variant="mv">
                            {mvCount} MV{mvCount > 1 ? 's' : ''}
                          </Badge>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DDL */}
      <div>
        <h2 className="mb-3 text-sm font-medium">DDL</h2>
        <pre className="rounded-lg border border-border bg-muted/30 p-4 text-xs leading-relaxed overflow-x-auto font-mono text-muted-foreground">
          {table.create_table_query}
        </pre>
      </div>
    </div>
  )
}

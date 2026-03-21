import { ChevronRight } from 'lucide-react'
import { useParams, useNavigate } from 'react-router'
import { MetricCard } from '@/components/shared/metric-card'
import { Badge } from '@/components/ui/badge'
import { getEngineVariant } from '@/components/ui/engine-variant'
import { mockTables, mockColumns } from '@/lib/mock/data'
import { formatBytes, formatNumber } from '@/lib/utils'

export function TableDetailPage() {
  const { name } = useParams<{ name: string }>()
  const navigate = useNavigate()

  const table = mockTables.find((t) => t.name === name)
  const columns = mockColumns.filter((c) => c.table === name)

  if (!table) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Table not found
      </div>
    )
  }

  const compression =
    table.total_bytes > 0
      ? ((table.compressed_bytes / table.total_bytes) * 100).toFixed(1) + '%'
      : '—'

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
        <span className="font-medium">{table.name}</span>
        <Badge variant={getEngineVariant(table.engine)} className="ml-2">
          {table.engine}
        </Badge>
      </nav>

      {/* Metric cards */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <MetricCard label="Rows" value={formatNumber(table.total_rows)} />
        <MetricCard
          label="Disk Size"
          value={formatBytes(table.total_bytes)}
          sub={`Compressed: ${formatBytes(table.compressed_bytes)}`}
        />
        <MetricCard label="Compression" value={compression} sub="compressed / raw" />
        <MetricCard label="Active Parts" value={table.active_parts.toString()} />
      </div>

      {/* Columns table */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium">Columns ({columns.length})</h2>
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
              </tr>
            </thead>
            <tbody>
              {columns.map((col) => (
                <tr
                  key={col.name}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-2.5 font-mono text-xs font-medium">{col.name}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {col.type}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {col.compression_codec || '—'}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">
                    {col.default_expression ? `${col.default_kind} ${col.default_expression}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Loader2, Zap } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { MetricCard } from '@/components/shared/metric-card'
import { Badge } from '@/components/ui/badge'
import { getEngineVariant } from '@/components/ui/engine-variant'
import { formatBytes, formatNumber } from '@/lib/utils'
import { useGraphStore } from '@/stores/graph-store'
import { useSchemaStore } from '@/stores/schema-store'

type ColSortField = 'name' | 'type' | 'mv'
type SortDir = 'asc' | 'desc'

export function TableDetailPage() {
  const { database, name } = useParams<{ database: string; name: string }>()
  const navigate = useNavigate()

  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)
  const columnsReady = useSchemaStore((s) => s.columnsReady)
  const graph = useGraphStore((s) => s.graph)

  const [colSort, setColSort] = useState<ColSortField>('name')
  const [colDir, setColDir] = useState<SortDir>('asc')

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

  const sortedColumns = useMemo(() => {
    const sorted = [...tableColumns]
    sorted.sort((a, b) => {
      let cmp = 0
      switch (colSort) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'type':
          cmp = a.type.localeCompare(b.type)
          break
        case 'mv':
          cmp = (mvCounts.get(a.name) ?? 0) - (mvCounts.get(b.name) ?? 0)
          break
      }
      return colDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [tableColumns, colSort, colDir, mvCounts])

  const toggleColSort = useCallback(
    (field: ColSortField) => {
      if (colSort === field) {
        setColDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setColSort(field)
        setColDir('asc')
      }
    },
    [colSort],
  )

  const colSortIcon = (field: ColSortField) => {
    if (colSort !== field) return <ArrowUpDown size={12} className="text-muted-foreground/50" />
    return colDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  const handleDropColumn = useCallback(
    (colName: string) => {
      const sql = `ALTER TABLE ${database}.${name} DROP COLUMN ${colName}`
      void navigate(`/impact?sql=${encodeURIComponent(sql)}`)
    },
    [database, name, navigate],
  )

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
                  <th
                    className="h-9 px-4 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => {
                      toggleColSort('name')
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      Name
                      {colSortIcon('name')}
                    </span>
                  </th>
                  <th
                    className="h-9 px-4 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => {
                      toggleColSort('type')
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      Type
                      {colSortIcon('type')}
                    </span>
                  </th>
                  <th className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                    Codec
                  </th>
                  <th className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                    Default
                  </th>
                  <th
                    className="h-9 px-4 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => {
                      toggleColSort('mv')
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      Used by
                      {colSortIcon('mv')}
                    </span>
                  </th>
                  <th className="h-9 px-4 text-left text-xs font-medium text-muted-foreground">
                    Impact
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedColumns.map((col) => {
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
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => {
                            handleDropColumn(col.name)
                          }}
                          className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                          title={`Analyze: ALTER TABLE ${database}.${name} DROP COLUMN ${col.name}`}
                        >
                          <Zap size={11} />
                          Drop?
                        </button>
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

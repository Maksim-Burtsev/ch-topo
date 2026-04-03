import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
  ClipboardCopy,
  Loader2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { MetricCard } from '@/components/shared/metric-card'
import { Badge } from '@/components/ui/badge'
import { getEngineVariant } from '@/components/ui/engine-variant'
import { fetchColumnUsage } from '@/lib/clickhouse/queries'
import { formatBytes, formatNumber, formatRelativeTime } from '@/lib/utils'
import { useConnectionStore } from '@/stores/connection-store'
import { useGraphStore } from '@/stores/graph-store'
import { useSchemaStore } from '@/stores/schema-store'

type ColSortField = 'name' | 'type' | 'size' | 'lastQueried' | 'mv'
type SortDir = 'asc' | 'desc'

/** Lightweight ClickHouse DDL formatter — adds line breaks at major clauses. */
function formatDDL(sql: string): string {
  // Normalise whitespace but preserve content inside backticks / parens
  let s = sql.trim()

  // Break before major top-level keywords (case-insensitive)
  const keywords = [
    'ENGINE',
    'ORDER BY',
    'PARTITION BY',
    'PRIMARY KEY',
    'SAMPLE BY',
    'TTL',
    'SETTINGS',
    'AS SELECT',
    'FROM',
    'WHERE',
    'GROUP BY',
    'HAVING',
    'POPULATE',
  ]

  for (const kw of keywords) {
    // Only break if it's not already at the start of a line
    const re = new RegExp(`(?<!^)\\s+(${kw})\\b`, 'gi')
    s = s.replace(re, '\n$1')
  }

  // Indent column list: break after opening ( and before closing ) for CREATE TABLE
  s = s.replace(/\(\s*`/g, '(\n  `')
  s = s.replace(/,\s*`/g, ',\n  `')
  s = s.replace(/\n\s*\)\s*ENGINE/g, '\n)\nENGINE')

  return s
}

export function TableDetailPage() {
  const { database, name } = useParams<{ database: string; name: string }>()
  const navigate = useNavigate()

  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)
  const columnsReady = useSchemaStore((s) => s.columnsReady)
  const graph = useGraphStore((s) => s.graph)
  const getParams = useConnectionStore((s) => s.getParams)

  const [colSort, setColSort] = useState<ColSortField>('name')
  const [colDir, setColDir] = useState<SortDir>('asc')
  const [columnUsage, setColumnUsage] = useState(new Map<string, string>())

  useEffect(() => {
    if (!database || !name) return
    let cancelled = false
    const prefix = `${database}.${name}.`
    fetchColumnUsage(getParams(), database, name)
      .then((rows) => {
        if (cancelled) return
        const map = new Map<string, string>()
        for (const row of rows) {
          if (row.col.startsWith(prefix)) {
            map.set(row.col.slice(prefix.length), row.last_queried)
          }
        }
        setColumnUsage(map)
      })
      .catch(() => {
        // silently ignore — usage data is supplementary
      })
    return () => {
      cancelled = true
    }
  }, [database, name, getParams])

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
        case 'size':
          cmp = Number(a.data_compressed_bytes) - Number(b.data_compressed_bytes)
          break
        case 'lastQueried': {
          const aTime = columnUsage.get(a.name) ?? ''
          const bTime = columnUsage.get(b.name) ?? ''
          cmp = aTime.localeCompare(bTime)
          break
        }
        case 'mv':
          cmp = (mvCounts.get(a.name) ?? 0) - (mvCounts.get(b.name) ?? 0)
          break
      }
      return colDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [tableColumns, colSort, colDir, columnUsage, mvCounts])

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
                    className="h-9 px-4 text-right text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => {
                      toggleColSort('size')
                    }}
                  >
                    <span className="inline-flex items-center justify-end gap-1.5">
                      Size
                      {colSortIcon('size')}
                    </span>
                  </th>
                  <th
                    className="h-9 px-4 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                    onClick={() => {
                      toggleColSort('lastQueried')
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      Last queried
                      {colSortIcon('lastQueried')}
                    </span>
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
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">
                        {(() => {
                          const compressed = Number(col.data_compressed_bytes)
                          const uncompressed = Number(col.data_uncompressed_bytes)
                          if (compressed === 0 && uncompressed === 0) return '\u2014'
                          return (
                            <span title={`Uncompressed: ${formatBytes(uncompressed)}`}>
                              {formatBytes(compressed)}
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {(() => {
                          const lastQueried = columnUsage.get(col.name)
                          if (!lastQueried)
                            return <span className="text-muted-foreground">{'\u2014'}</span>
                          const { text, freshness, title } = formatRelativeTime(lastQueried)
                          const colorMap = {
                            fresh: 'text-emerald-500',
                            stale: 'text-amber-500',
                            dead: 'text-red-400',
                          } as const
                          const colorClass = colorMap[freshness]
                          return (
                            <span className={colorClass} title={title}>
                              {text}
                            </span>
                          )
                        })()}
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
      <DDLBlock sql={table.create_table_query} />
    </div>
  )
}

function DDLBlock({ sql }: { sql: string }) {
  const [copied, setCopied] = useState(false)
  const formatted = useMemo(() => formatDDL(sql), [sql])

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(sql).then(() => {
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    })
  }, [sql])

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium">DDL</h2>
      <div className="group relative rounded-lg border border-border bg-muted/30">
        <button
          onClick={handleCopy}
          className="absolute right-2 top-2 rounded-md border border-border bg-card p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
          title="Copy DDL"
        >
          {copied ? <Check size={14} /> : <ClipboardCopy size={14} />}
        </button>
        <pre className="p-4 text-xs leading-relaxed overflow-x-auto font-mono text-muted-foreground whitespace-pre-wrap break-words">
          {formatted}
        </pre>
      </div>
    </div>
  )
}

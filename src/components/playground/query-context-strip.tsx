import { Check, Copy, ExternalLink, Table2 } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { RawTableRow } from '@/lib/clickhouse/types'
import { copyToClipboard } from '@/lib/playground/results-format'
import { extractQueryTableRefs } from '@/lib/playground/sql-references'
import { formatBytes, formatNumber } from '@/lib/utils'

interface QueryContextStripProps {
  sql: string
  currentDatabase: string
  tables: RawTableRow[]
}

interface ResolvedRef {
  key: string
  displayName: string
  database: string
  table: string
  tableInfo: RawTableRow | undefined
}

function tableKey(database: string, table: string): string {
  return `${database}.${table}`
}

function tablePath(database: string, table: string): string {
  return `/tables/${encodeURIComponent(database)}/${encodeURIComponent(table)}`
}

export function QueryContextStrip({ sql, currentDatabase, tables }: QueryContextStripProps) {
  const navigate = useNavigate()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const refs = useMemo<ResolvedRef[]>(() => {
    const byName = new Map(tables.map((table) => [tableKey(table.database, table.name), table]))
    return extractQueryTableRefs(sql, currentDatabase).map((ref) => {
      const key = tableKey(ref.database, ref.table)
      return {
        key,
        displayName: ref.displayName,
        database: ref.database,
        table: ref.table,
        tableInfo: byName.get(key),
      }
    })
  }, [currentDatabase, sql, tables])

  const handleCopy = useCallback((ref: ResolvedRef) => {
    copyToClipboard(ref.displayName).then(
      () => {
        setCopiedKey(ref.key)
        setTimeout(() => {
          setCopiedKey(null)
        }, 1500)
      },
      () => {},
    )
  }, [])

  if (refs.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/70 px-3 py-2 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Table2 className="h-3.5 w-3.5" />
        <span>Query touches</span>
      </div>

      {refs.map((ref) => {
        const tableInfo = ref.tableInfo
        return (
          <div
            key={ref.key}
            className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1"
          >
            <span className="font-mono text-[11px] text-foreground">{ref.displayName}</span>
            {tableInfo ? (
              <>
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {tableInfo.engine}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatNumber(Number(tableInfo.total_rows) || 0)} rows
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {formatBytes(Number(tableInfo.total_bytes) || 0)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    void navigate(tablePath(ref.database, ref.table))
                  }}
                  className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  title={`Open ${ref.displayName}`}
                >
                  <ExternalLink className="h-3 w-3" />
                </button>
              </>
            ) : (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground">
                not in loaded schema
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                handleCopy(ref)
              }}
              className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title={`Copy ${ref.displayName}`}
            >
              {copiedKey === ref.key ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

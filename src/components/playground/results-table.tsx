import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, Download, Eye, X } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { QueryColumn, QueryResult } from '@/lib/playground/execute'
import { formatElapsed } from '@/lib/playground/query-stats-format'
import {
  copyToClipboard,
  formatCellValue,
  isNullish,
  rowsToCsv,
  sortRows,
} from '@/lib/playground/results-format'
import type { SortState } from '@/lib/playground/results-format'
import { cn, formatBytes, formatNumber } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────

const PAGE_SIZE = 100
const MAX_CELL_LENGTH = 200

// ── Helpers ───────────────────────────────────────────────────

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function csvFilename(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return `chtopo-results-${stamp}.csv`
}

// ── Component ─────────────────────────────────────────────────

interface ResultsTableProps {
  result: QueryResult
  className?: string
}

export function ResultsTable({ result, className }: ResultsTableProps) {
  const { columns, rows } = result
  const [sort, setSort] = useState<SortState | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [copiedCell, setCopiedCell] = useState<string | null>(null)
  const [copiedRow, setCopiedRow] = useState<number | null>(null)
  const [exported, setExported] = useState(false)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort])
  const visibleRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount])
  const selectedRow = selectedRowIndex == null ? null : (sortedRows[selectedRowIndex] ?? null)
  const hasMore = visibleCount < sortedRows.length
  const columnNames = useMemo(() => columns.map((column) => column.name), [columns])

  const handleSort = useCallback((columnName: string) => {
    setSort((prev) => {
      if (prev?.column === columnName) {
        return prev.direction === 'asc' ? { column: columnName, direction: 'desc' } : null
      }
      return { column: columnName, direction: 'asc' }
    })
  }, [])

  const handleLoadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE)
  }, [])

  const handleCopy = useCallback((rowIdx: number, colName: string, value: unknown) => {
    const key = `${rowIdx}-${colName}`
    copyToClipboard(value).then(
      () => {
        setCopiedCell(key)
        setTimeout(() => {
          setCopiedCell(null)
        }, 1500)
      },
      () => {
        // clipboard write failed — ignore silently
      },
    )
  }, [])

  const handleCopyRow = useCallback((rowIdx: number, row: Record<string, unknown>) => {
    copyToClipboard(row).then(
      () => {
        setCopiedRow(rowIdx)
        setTimeout(() => {
          setCopiedRow(null)
        }, 1500)
      },
      () => {
        // clipboard write failed — ignore silently
      },
    )
  }, [])

  const handleExportCsv = useCallback(() => {
    downloadTextFile(csvFilename(), rowsToCsv(sortedRows, columnNames), 'text/csv;charset=utf-8')
    setExported(true)
    setTimeout(() => {
      setExported(false)
    }, 1500)
  }, [columnNames, sortedRows])

  if (rows.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center py-12 text-sm text-muted-foreground',
          className,
        )}
      >
        Query returned 0 rows
      </div>
    )
  }

  return (
    <div className={cn('flex min-h-full', className)}>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-border bg-card/95 px-3 py-2 text-xs backdrop-blur">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-muted-foreground">
            <span className="font-medium text-foreground">{formatNumber(rows.length)} rows</span>
            <span>{formatNumber(columns.length)} columns</span>
            <span>{formatElapsed(result.elapsed)}</span>
            <span>{formatNumber(result.rowsRead)} read</span>
            <span>{formatBytes(result.bytesRead)}</span>
            {sort && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">
                sorted {sort.column} {sort.direction}
              </span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              {exported ? (
                <>
                  <Check className="h-3 w-3 text-emerald-400" />
                  Exported
                </>
              ) : (
                <>
                  <Download className="h-3 w-3" />
                  CSV
                </>
              )}
            </button>
          </div>
        </div>

        <Table>
          <TableHeader className="sticky top-0 z-20 bg-card shadow-sm">
            <TableRow>
              <TableHead className="w-14 bg-card text-right">#</TableHead>
              {columns.map((col) => (
                <SortableHeader key={col.name} column={col} sort={sort} onSort={handleSort} />
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row, rowIdx) => (
              <TableRow
                key={rowIdx}
                data-state={selectedRowIndex === rowIdx ? 'selected' : undefined}
                className="cursor-pointer"
                onClick={() => {
                  setSelectedRowIndex(rowIdx)
                }}
              >
                <TableCell className="sticky left-0 z-10 w-14 bg-background pr-2 text-right text-xs text-muted-foreground">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      setSelectedRowIndex(rowIdx)
                    }}
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors hover:bg-secondary hover:text-foreground"
                    title={`Inspect row ${rowIdx + 1}`}
                  >
                    <Eye className="h-3 w-3" />
                    {rowIdx + 1}
                  </button>
                </TableCell>
                {columns.map((col) => {
                  const value = row[col.name]
                  const cellKey = `${rowIdx}-${col.name}`
                  return (
                    <CellValue
                      key={col.name}
                      value={value}
                      copied={copiedCell === cellKey}
                      onClick={() => {
                        handleCopy(rowIdx, col.name, value)
                      }}
                    />
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {hasMore && (
          <button
            type="button"
            onClick={handleLoadMore}
            className="mx-auto my-3 flex rounded-md bg-secondary px-4 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            Load more ({sortedRows.length - visibleCount} remaining)
          </button>
        )}
      </div>

      {selectedRow && selectedRowIndex != null && (
        <RowDetailPanel
          row={selectedRow}
          rowIndex={selectedRowIndex}
          columns={columns}
          copied={copiedRow === selectedRowIndex}
          onCopy={() => {
            handleCopyRow(selectedRowIndex, selectedRow)
          }}
          onClose={() => {
            setSelectedRowIndex(null)
          }}
        />
      )}
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

interface SortableHeaderProps {
  column: QueryColumn
  sort: SortState | null
  onSort: (name: string) => void
}

function SortableHeader({ column, sort, onSort }: SortableHeaderProps) {
  const isActive = sort?.column === column.name

  let Icon = ArrowUpDown
  if (isActive) {
    Icon = sort.direction === 'asc' ? ArrowUp : ArrowDown
  }

  return (
    <TableHead
      className="cursor-pointer select-none whitespace-nowrap bg-card"
      onClick={() => {
        onSort(column.name)
      }}
    >
      <span className="inline-flex items-center gap-1.5">
        <span>{column.name}</span>
        <span className="text-[10px] font-normal text-muted-foreground/60">{column.type}</span>
        <Icon
          className={cn('h-3 w-3', isActive ? 'text-foreground' : 'text-muted-foreground/40')}
        />
      </span>
    </TableHead>
  )
}

interface CellValueProps {
  value: unknown
  copied: boolean
  onClick: () => void
}

function CellValue({ value, copied, onClick }: CellValueProps) {
  const isNull = isNullish(value)
  const formatted = formatCellValue(value)
  const isTruncated = formatted.length > MAX_CELL_LENGTH
  const display = isTruncated ? `${formatted.slice(0, MAX_CELL_LENGTH)}...` : formatted

  return (
    <TableCell
      className="group relative max-w-[300px] cursor-pointer whitespace-nowrap"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      title={isTruncated ? formatted : undefined}
    >
      {isNull ? (
        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">NULL</span>
      ) : (
        <span className="truncate">{display}</span>
      )}
      <span
        className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2 rounded bg-secondary p-0.5 text-muted-foreground',
          copied ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </span>
    </TableCell>
  )
}

interface RowDetailPanelProps {
  row: Record<string, unknown>
  rowIndex: number
  columns: QueryColumn[]
  copied: boolean
  onCopy: () => void
  onClose: () => void
}

function RowDetailPanel({ row, rowIndex, columns, copied, onCopy, onClose }: RowDetailPanelProps) {
  return (
    <aside className="sticky top-0 h-fit max-h-[calc(100vh-11rem)] w-80 shrink-0 overflow-hidden border-l border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Row {rowIndex + 1}</h3>
          <p className="text-[10px] text-muted-foreground">{columns.length} fields</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                JSON
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Close row detail"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-[calc(100vh-15rem)] overflow-auto p-2">
        {columns.map((column) => {
          const value = row[column.name]
          const isNull = isNullish(value)
          return (
            <div key={column.name} className="rounded-md px-2 py-2 hover:bg-secondary/40">
              <div className="mb-1 flex items-center gap-2">
                <span className="min-w-0 truncate text-xs font-medium">{column.name}</span>
                <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
                  {column.type}
                </span>
              </div>
              {isNull ? (
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  NULL
                </span>
              ) : (
                <code className="block max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-muted-foreground">
                  {formatCellValue(value)}
                </code>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

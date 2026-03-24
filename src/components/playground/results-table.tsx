import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy } from 'lucide-react'
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
import {
  copyToClipboard,
  formatCellValue,
  isNullish,
  sortRows,
} from '@/lib/playground/results-format'
import type { SortState } from '@/lib/playground/results-format'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────

const PAGE_SIZE = 100
const MAX_CELL_LENGTH = 200

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

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort])
  const visibleRows = useMemo(() => sortedRows.slice(0, visibleCount), [sortedRows, visibleCount])
  const hasMore = visibleCount < sortedRows.length

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
    <div className={cn('flex flex-col', className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <SortableHeader key={col.name} column={col} sort={sort} onSort={handleSort} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visibleRows.map((row, rowIdx) => (
            <TableRow key={rowIdx}>
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
          className="mx-auto my-3 rounded-md bg-secondary px-4 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          Load more ({sortedRows.length - visibleCount} remaining)
        </button>
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
      className="cursor-pointer select-none whitespace-nowrap"
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
  const display = isTruncated ? `${formatted.slice(0, MAX_CELL_LENGTH)}…` : formatted

  return (
    <TableCell
      className="group relative max-w-[300px] cursor-pointer whitespace-nowrap"
      onClick={onClick}
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

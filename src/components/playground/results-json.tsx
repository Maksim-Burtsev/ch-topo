import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import type { QueryResult } from '@/lib/playground/execute'
import type { JsonToken } from '@/lib/playground/json-tokenize'
import { TOKEN_CLASSES, tokenizeJson } from '@/lib/playground/json-tokenize'
import { copyToClipboard } from '@/lib/playground/results-format'
import { cn } from '@/lib/utils'

// ── Constants ─────────────────────────────────────────────────

const COLLAPSED_THRESHOLD = 20

// ── Component ─────────────────────────────────────────────────

interface ResultsJsonProps {
  result: QueryResult
  className?: string
}

export function ResultsJson({ result, className }: ResultsJsonProps) {
  const { rows } = result
  const [copied, setCopied] = useState(false)
  const [collapsedRows, setCollapsedRows] = useState<Set<number>>(() => {
    if (rows.length > COLLAPSED_THRESHOLD) {
      return new Set(rows.map((_, i) => i))
    }
    return new Set()
  })

  const isCollapsible = rows.length > COLLAPSED_THRESHOLD

  const tokenizedRows = useMemo(
    () => rows.map((row) => tokenizeJson(row, 0)),
    [rows],
  )

  const handleCopyAll = useCallback(() => {
    copyToClipboard(rows).then(() => {
      setCopied(true)
      setTimeout(() => {
        setCopied(false)
      }, 1500)
    }, () => {
      // clipboard write failed
    })
  }, [rows])

  const toggleRow = useCallback((index: number) => {
    setCollapsedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setCollapsedRows((prev) => {
      if (prev.size === rows.length) {
        return new Set()
      }
      return new Set(rows.map((_, i) => i))
    })
  }, [rows])

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
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        {isCollapsible && (
          <button
            type="button"
            onClick={toggleAll}
            className="rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {collapsedRows.size === rows.length ? 'Expand all' : 'Collapse all'}
          </button>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={handleCopyAll}
          className="inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy JSON
            </>
          )}
        </button>
      </div>

      <div className="overflow-auto">
        <pre className="p-3 text-xs leading-5 font-mono">
          <span className={TOKEN_CLASSES.punctuation}>{'[\n'}</span>
          {tokenizedRows.map((rowLines, rowIdx) => {
            const isCollapsed = collapsedRows.has(rowIdx)
            const isLast = rowIdx === rows.length - 1
            const row = rows[rowIdx]

            if (isCollapsible && isCollapsed && row) {
              return (
                <CollapsedRow
                  key={rowIdx}
                  index={rowIdx}
                  row={row}
                  isLast={isLast}
                  onToggle={toggleRow}
                />
              )
            }

            return (
              <ExpandedRow
                key={rowIdx}
                index={rowIdx}
                lines={rowLines}
                isLast={isLast}
                isCollapsible={isCollapsible}
                onToggle={toggleRow}
              />
            )
          })}
          <span className={TOKEN_CLASSES.punctuation}>{']'}</span>
        </pre>
      </div>
    </div>
  )
}

// ── Subcomponents ─────────────────────────────────────────────

interface CollapsedRowProps {
  index: number
  row: Record<string, unknown>
  isLast: boolean
  onToggle: (index: number) => void
}

function CollapsedRow({ index, row, isLast, onToggle }: CollapsedRowProps) {
  const keys = Object.keys(row)
  const preview =
    keys.length <= 3
      ? keys.join(', ')
      : `${keys.slice(0, 3).join(', ')}, ...`

  return (
    <span className="inline">
      <button
        type="button"
        onClick={() => { onToggle(index) }}
        className="inline-flex items-center text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className="inline h-3 w-3" />
      </button>
      <span
        className="cursor-pointer text-muted-foreground hover:text-foreground"
        onClick={() => { onToggle(index) }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') onToggle(index) }}
      >
        {'  {'}
        <span className="text-muted-foreground/60">{` ${preview} `}</span>
        {'}'}
        {!isLast && <span className={TOKEN_CLASSES.punctuation}>,</span>}
      </span>
      {'\n'}
    </span>
  )
}

interface ExpandedRowProps {
  index: number
  lines: JsonToken[][]
  isLast: boolean
  isCollapsible: boolean
  onToggle: (index: number) => void
}

function ExpandedRow({
  index,
  lines,
  isLast,
  isCollapsible,
  onToggle,
}: ExpandedRowProps) {
  return (
    <span className="inline">
      {lines.map((tokens, lineIdx) => {
        const isFirstLine = lineIdx === 0
        const isLastLine = lineIdx === lines.length - 1
        return (
          <span key={lineIdx}>
            {isFirstLine && isCollapsible && (
              <button
                type="button"
                onClick={() => { onToggle(index) }}
                className="inline-flex items-center text-muted-foreground hover:text-foreground"
              >
                <ChevronDown className="inline h-3 w-3" />
              </button>
            )}
            {isFirstLine && isCollapsible && '  '}
            {isFirstLine && !isCollapsible && '  '}
            {!isFirstLine && (isCollapsible ? '    ' : '  ')}
            {tokens.map((token, tokenIdx) => (
              <span key={tokenIdx} className={TOKEN_CLASSES[token.type]}>
                {token.value}
              </span>
            ))}
            {isLastLine && !isLast && (
              <span className={TOKEN_CLASSES.punctuation}>,</span>
            )}
            {'\n'}
          </span>
        )
      })}
    </span>
  )
}

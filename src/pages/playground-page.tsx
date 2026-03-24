import { Clock, Eraser, Play, TableProperties, Braces } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ExplainView } from '@/components/playground/explain-view'
import { QueryHistory } from '@/components/playground/query-history'
import { QueryStats, type QueryState } from '@/components/playground/query-stats'
import { ResultsJson } from '@/components/playground/results-json'
import { ResultsTable } from '@/components/playground/results-table'
import { SqlEditor, type SqlEditorHandle } from '@/components/playground/sql-editor'
import { executeQuery, type QueryResult } from '@/lib/playground/execute'
import { explainQuery, type ExplainMode, type ExplainResult } from '@/lib/playground/explain'
import { addToHistory } from '@/lib/playground/history'
import { cn } from '@/lib/utils'
import { useConnectionStore } from '@/stores/connection-store'
import { usePlaygroundStore } from '@/stores/playground-store'

// ── Constants ──────────────────────────────────────────────────

const MAX_DISPLAY_ROWS = 1000
const MIN_EDITOR_PCT = 15
const MAX_EDITOR_PCT = 85

// ── Helpers ────────────────────────────────────────────────────

/**
 * Given full SQL text and a cursor offset, find the statement the cursor is in.
 * Statements are separated by `;`. Returns the trimmed statement.
 */
function extractStatementAtCursor(sql: string, cursorOffset: number): string {
  // Split by semicolons, tracking char ranges
  let start = 0
  const segments: { text: string; start: number; end: number }[] = []
  const parts = sql.split(';')
  for (const part of parts) {
    const end = start + part.length
    segments.push({ text: part, start, end })
    start = end + 1 // +1 for the semicolon
  }

  // Find which segment contains the cursor
  const offset = Math.min(cursorOffset, sql.length)
  for (const seg of segments) {
    if (offset <= seg.end) {
      const trimmed = seg.text.trim()
      if (trimmed) return trimmed
      break
    }
  }

  // Fallback: find last non-empty segment before cursor
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i]
    if (seg && offset >= seg.start) {
      const trimmed = seg.text.trim()
      if (trimmed) return trimmed
    }
  }

  // Last resort: first non-empty statement
  for (const seg of segments) {
    const trimmed = seg.text.trim()
    if (trimmed) return trimmed
  }

  return sql.trim()
}

function isMac(): boolean {
  return navigator.userAgent.includes('Mac')
}

// ── Component ──────────────────────────────────────────────────

export function PlaygroundPage() {
  const sql = usePlaygroundStore((s) => s.sql)
  const setSql = usePlaygroundStore((s) => s.setSql)
  const format = usePlaygroundStore((s) => s.format)
  const setFormat = usePlaygroundStore((s) => s.setFormat)
  const toggleFormat = usePlaygroundStore((s) => s.toggleFormat)
  const editorPct = usePlaygroundStore((s) => s.editorPct)
  const setEditorPct = usePlaygroundStore((s) => s.setEditorPct)
  const getParams = useConnectionStore((s) => s.getParams)

  const [queryState, setQueryState] = useState<QueryState>({ status: 'idle' })
  const [result, setResult] = useState<QueryResult | null>(null)
  const [cappedMessage, setCappedMessage] = useState<string | null>(null)
  const [explainResult, setExplainResult] = useState<ExplainResult | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<SqlEditorHandle>(null)

  // ── Get active statement ─────────────────────────────────────

  const getActiveStatement = useCallback((): string => {
    const editor = editorRef.current
    if (!editor) {
      // Fallback: first statement
      const idx = sql.indexOf(';')
      return (idx >= 0 ? sql.slice(0, idx) : sql).trim()
    }

    // If there's a selection, use it
    const selection = editor.getSelection()
    if (selection) return selection.trim()

    // Otherwise find statement at cursor
    const offset = editor.getCursorOffset()
    return extractStatementAtCursor(sql, offset)
  }, [sql])

  // ── Execute ────────────────────────────────────────────────

  const handleExecute = useCallback(() => {
    const stmt = getActiveStatement()
    if (!stmt) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setExplainResult(null)
    setQueryState({
      status: 'running',
      onCancel: () => {
        controller.abort()
      },
    })

    executeQuery(stmt, getParams(), { signal: controller.signal }).then(
      (res) => {
        if (controller.signal.aborted) return

        const totalRows = res.rows.length
        let displayResult = res
        let capped: string | null = null

        if (totalRows > MAX_DISPLAY_ROWS) {
          displayResult = { ...res, rows: res.rows.slice(0, MAX_DISPLAY_ROWS) }
          capped = `Showing first ${MAX_DISPLAY_ROWS} of ${totalRows.toLocaleString()} rows`
        }

        setResult(displayResult)
        setCappedMessage(capped)
        setQueryState(
          res.error ? { status: 'error', result: res } : { status: 'success', result: res },
        )

        addToHistory({
          sql: stmt,
          timestamp: Date.now(),
          elapsed: res.elapsed,
          rowsReturned: totalRows,
          error: !!res.error,
        })
      },
      () => {
        // should not happen — executeQuery catches all errors
      },
    )
  }, [getActiveStatement, getParams])

  // ── Explain ────────────────────────────────────────────────

  const handleExplain = useCallback(
    (mode: ExplainMode) => {
      const stmt = getActiveStatement()
      if (!stmt) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setResult(null)
      setCappedMessage(null)
      setQueryState({
        status: 'running',
        onCancel: () => {
          controller.abort()
        },
      })

      explainQuery(stmt, getParams(), mode, { signal: controller.signal }).then(
        (res) => {
          if (controller.signal.aborted) return
          setExplainResult(res)
          setQueryState(
            res.error
              ? {
                  status: 'error',
                  result: {
                    columns: [],
                    rows: [],
                    elapsed: 0,
                    rowsRead: 0,
                    bytesRead: 0,
                    error: res.error,
                  },
                }
              : { status: 'idle' },
          )
        },
        () => {},
      )
    },
    [getActiveStatement, getParams],
  )

  const handleExplainModeChange = useCallback(
    (mode: ExplainMode) => {
      handleExplain(mode)
    },
    [handleExplain],
  )

  // ── Clear ──────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    abortRef.current?.abort()
    setResult(null)
    setCappedMessage(null)
    setExplainResult(null)
    setQueryState({ status: 'idle' })
  }, [])

  // ── History ────────────────────────────────────────────────

  const handleHistorySelect = useCallback(
    (selectedSql: string) => {
      setSql(selectedSql)
    },
    [setSql],
  )

  // ── Keyboard shortcuts ─────────────────────────────────────

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = isMac() ? e.metaKey : e.ctrlKey

      // Ctrl/Cmd+Enter → execute
      if (mod && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleExecute()
        return
      }

      // Ctrl/Cmd+Shift+Enter → explain plan
      if (mod && e.shiftKey && e.key === 'Enter') {
        e.preventDefault()
        handleExplain('plan')
        return
      }

      // Ctrl/Cmd+L → clear results
      if (mod && e.key === 'l') {
        e.preventDefault()
        handleClear()
        return
      }

      // Ctrl/Cmd+H → toggle history (only when not in input)
      if (mod && e.key === 'h') {
        const target = e.target as HTMLElement
        const isInput =
          target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
        if (!isInput) {
          e.preventDefault()
          setHistoryOpen((prev) => !prev)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [handleExecute, handleExplain, handleClear])

  // ── Drag resize ────────────────────────────────────────────

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const container = containerRef.current
      if (!container) return

      const startY = e.clientY
      const startPct = editorPct
      const containerHeight = container.getBoundingClientRect().height

      function onMove(ev: MouseEvent) {
        const delta = ev.clientY - startY
        const deltaPct = (delta / containerHeight) * 100
        const next = Math.min(MAX_EDITOR_PCT, Math.max(MIN_EDITOR_PCT, startPct + deltaPct))
        setEditorPct(next)
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [editorPct, setEditorPct],
  )

  // ── Render helpers ─────────────────────────────────────────

  const modKey = isMac() ? '⌘' : 'Ctrl'
  const hasResults = result !== null || explainResult !== null
  const isRunning = queryState.status === 'running'

  return (
    <div ref={containerRef} className="flex h-full flex-col overflow-hidden -m-6">
      {/* Editor area */}
      <div style={{ height: `${editorPct}%` }} className="flex flex-col min-h-0">
        <SqlEditor ref={editorRef} value={sql} onChange={setSql} className="flex-1 min-h-0" />
      </div>

      {/* Drag resize divider */}
      <div
        className="h-1.5 cursor-row-resize bg-border/50 hover:bg-primary/30 transition-colors shrink-0"
        onMouseDown={handleDragStart}
        title="Drag to resize"
      />

      {/* Toolbar */}
      <div className="flex items-center gap-1.5 border-b border-border bg-card px-3 py-1.5 select-none">
        {/* Execute */}
        <button
          type="button"
          onClick={handleExecute}
          disabled={isRunning || !sql.trim()}
          title={`Execute (${modKey}+Enter)`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Play className="h-3 w-3" />
          Execute
        </button>

        <div className="mx-1 h-4 w-px bg-border" />

        {/* Format toggle */}
        <button
          type="button"
          onClick={toggleFormat}
          title={`Format: ${format === 'table' ? 'Table' : 'JSON'}`}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80',
          )}
        >
          {format === 'table' ? (
            <>
              <TableProperties className="h-3 w-3" />
              Table
            </>
          ) : (
            <>
              <Braces className="h-3 w-3" />
              JSON
            </>
          )}
        </button>

        {/* History toggle */}
        <button
          type="button"
          onClick={() => {
            setHistoryOpen((v) => !v)
          }}
          title={`History (${modKey}+H)`}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors',
            historyOpen
              ? 'bg-accent text-foreground'
              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
          )}
        >
          <Clock className="h-3 w-3" />
          History
        </button>

        {/* Clear */}
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasResults && queryState.status === 'idle'}
          title={`Clear (${modKey}+L)`}
          className="inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-1 text-xs text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
        >
          <Eraser className="h-3 w-3" />
          Clear
        </button>

        {/* Shortcut hints */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground/50">
            {modKey}+Enter run · {modKey}+Shift+Enter explain
          </span>
          {format === 'table' ? (
            <button
              type="button"
              onClick={() => {
                setFormat('json')
              }}
              className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Switch to JSON
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setFormat('table')
              }}
              className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            >
              Switch to Table
            </button>
          )}
        </div>
      </div>

      {/* Results area */}
      <div style={{ flex: 1 }} className="flex min-h-0 overflow-hidden">
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          {/* Query stats bar */}
          <QueryStats state={queryState} />

          {/* Capped rows message */}
          {cappedMessage && (
            <div className="border-b border-border bg-yellow-500/10 px-3 py-1 text-xs text-yellow-600 dark:text-yellow-400">
              {cappedMessage}
            </div>
          )}

          {/* Results content */}
          <div className="flex-1 overflow-auto">
            {/* Loading skeleton */}
            {isRunning && (
              <div className="flex flex-col gap-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-4 animate-pulse rounded bg-muted"
                    style={{ width: `${80 - i * 8}%` }}
                  />
                ))}
              </div>
            )}

            {/* Explain result */}
            {!isRunning && explainResult && (
              <ExplainView
                result={explainResult}
                onModeChange={handleExplainModeChange}
                className="h-full"
              />
            )}

            {/* Query results */}
            {!isRunning &&
              result &&
              !explainResult &&
              (format === 'table' ? (
                <ResultsTable result={result} />
              ) : (
                <ResultsJson result={result} />
              ))}

            {/* Empty state */}
            {!isRunning && !result && !explainResult && queryState.status !== 'error' && (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Write a query and press {modKey}+Enter
              </div>
            )}
          </div>
        </div>

        {/* History panel */}
        <QueryHistory
          open={historyOpen}
          onClose={() => {
            setHistoryOpen(false)
          }}
          onSelect={handleHistorySelect}
        />
      </div>
    </div>
  )
}

# Plan: SQL Playground

## Validation Commands
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

### Task 1: Monaco Editor setup
- [x] Install `@monaco-editor/react` package
- [x] Create `src/components/playground/sql-editor.tsx` — Monaco wrapper component
- [x] Configure Monaco for SQL language mode
- [x] Theme: auto-detect dark/light from app theme, configure matching Monaco theme
- [x] Editor options: minimap off, line numbers on, word wrap on, font size 14px, font family monospace
- [x] Resize: editor fills available height (flex: 1)
- [x] Expose value and onChange props

### Task 2: SQL autocomplete from schema
- [x] Create `src/lib/playground/autocomplete.ts`
- [x] Register Monaco completion provider for SQL
- [x] Completions sourced from schema store:
  - Database names
  - Table names (qualified: `database.table` and unqualified)
  - Column names (when cursor is after a table name or alias)
  - ClickHouse functions: top 50 most common (count, sum, avg, uniq, uniqExact, toDate, toDateTime, toString, arrayJoin, groupArray, etc)
  - ClickHouse keywords: SELECT, FROM, WHERE, GROUP BY, ORDER BY, LIMIT, JOIN, ON, USING, AS, WITH, HAVING, UNION ALL, INSERT INTO, CREATE TABLE, ALTER TABLE, DROP TABLE
- [x] Show column type in autocomplete detail
- [x] Trigger on dot (database.table.column) and on space after FROM/JOIN

### Task 3: Query execution engine
- [ ] Create `src/lib/playground/execute.ts`
- [ ] Function `executeQuery(sql: string, client: ClickHouseClient): Promise<QueryResult>`
- [ ] QueryResult: `{ columns: { name: string, type: string }[], rows: Record<string, unknown>[], elapsed: number, rowsRead: number, bytesRead: number, error?: string }`
- [ ] Parse response headers for stats: X-ClickHouse-Summary
- [ ] Handle errors: parse ClickHouse error message, extract line number if available
- [ ] Support query cancellation via AbortController
- [ ] Timeout: 30 seconds default, configurable

### Task 4: Results table component
- [ ] Create `src/components/playground/results-table.tsx`
- [ ] Render query results as a table with shadcn/ui Table components
- [ ] Column headers: name + type (muted)
- [ ] Sortable columns (client-side sort on click)
- [ ] Virtual scrolling for large result sets (only render visible rows) — use simple windowing: render first 100 rows, "Load more" button or scroll trigger
- [ ] Cell rendering: truncate long strings with tooltip on hover, format numbers with locale, format dates
- [ ] Null values shown as muted "NULL" badge
- [ ] Empty result: "Query returned 0 rows"
- [ ] Copy cell value on click

### Task 5: JSON view component
- [ ] Create `src/components/playground/results-json.tsx`
- [ ] Toggle between Table view and JSON view
- [ ] JSON view: pretty-printed JSON of the result rows
- [ ] Syntax highlighted (use simple CSS coloring: strings=green, numbers=blue, keys=default, null=muted)
- [ ] Copy all JSON button
- [ ] Collapsible rows for large results

### Task 6: Query stats bar
- [ ] Create `src/components/playground/query-stats.tsx`
- [ ] Shown between editor and results after execution
- [ ] Display: elapsed time, rows read, bytes read, rows returned
- [ ] Format bytes human-readable (KB, MB, GB)
- [ ] Error state: red background with error message and line number highlighted in editor
- [ ] Running state: spinner + "Executing..." + cancel button

### Task 7: Query history
- [ ] Create `src/lib/playground/history.ts`
- [ ] Store in localStorage: last 100 queries
- [ ] Each entry: sql, timestamp, elapsed, rowsReturned, error (boolean)
- [ ] Functions: addToHistory(), getHistory(), clearHistory()
- [ ] Create `src/components/playground/query-history.tsx`
- [ ] Sidebar panel or dropdown showing history
- [ ] Each item: first line of SQL (truncated), timestamp, elapsed badge, error badge if failed
- [ ] Click → load SQL into editor
- [ ] Clear history button
- [ ] Search/filter within history

### Task 8: EXPLAIN support
- [ ] Create `src/lib/playground/explain.ts`
- [ ] Function `explainQuery(sql: string, client): Promise<ExplainResult>`
- [ ] Prepend `EXPLAIN PLAN` to the query
- [ ] Also support `EXPLAIN PIPELINE` and `EXPLAIN SYNTAX`
- [ ] ExplainResult: parsed tree or raw text
- [ ] Create `src/components/playground/explain-view.tsx`
- [ ] Render EXPLAIN output as formatted monospace text
- [ ] Tab selector: Plan / Pipeline / Syntax

### Task 9: Playground page assembly
- [ ] Create `src/pages/playground-page.tsx`
- [ ] Layout: vertical split — editor on top (40% height), results on bottom (60%)
- [ ] Draggable divider between editor and results (resize handle)
- [ ] Toolbar between editor and results:
  - Execute button (primary, with Ctrl+Enter hint)
  - Explain dropdown (Plan / Pipeline / Syntax, with Ctrl+Shift+Enter hint)
  - Format selector: Table / JSON
  - History toggle button
  - Clear button
- [ ] Keyboard shortcuts:
  - Ctrl+Enter (Cmd+Enter on Mac) → execute query
  - Ctrl+Shift+Enter → explain plan
  - Ctrl+L → clear results
  - Ctrl+H → toggle history panel
- [ ] History panel: slide-in from right side, overlays results area
- [ ] Loading state: show skeleton in results area while query runs
- [ ] No query yet state: centered message "Write a query and press Ctrl+Enter"

### Task 10: Sidebar integration and routing
- [ ] Add Playground icon to sidebar (terminal/code icon, position: after Impact, before History)
- [ ] Add route: `/#/playground`
- [ ] Keyboard shortcut 6 → navigate to playground
- [ ] Update sidebar active state

### Task 11: Polish and edge cases
- [ ] Multiple statements: if SQL contains multiple statements separated by `;`, execute only the one under cursor (or first one)
- [ ] Large results: cap at 1000 rows with message "Showing first 1000 of N rows. Add LIMIT to your query."
- [ ] Binary data in results: show as hex preview
- [ ] Dark mode: Monaco dark theme + all result components
- [ ] Editor remembers last query on page navigation (store in zustand, not localStorage)
- [ ] Tab title: "Playground — chtopo"
- [ ] All validation commands pass clean
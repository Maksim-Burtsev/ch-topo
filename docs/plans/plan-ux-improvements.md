# Plan: UX Improvements

## Validation Commands
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

### Task 1: Database filter on Tables page
- [x] Extract unique database names from schema store (system.tables → database field)
- [x] Add database dropdown filter above the table (before or next to the existing search input)
- [x] Options: "All databases" (default) + each database name
- [x] Filtering: when database selected, table list shows only tables from that database
- [x] Badge next to dropdown showing count: "24 tables" updates on filter change
- [x] Engine filter (if already exists) should work in combination with database filter
- [x] If only one database exists — still show the dropdown but pre-selected, so user sees the database name

### Task 2: Engine type filter on Tables page
- [ ] Add engine filter dropdown or multi-select chip bar (MergeTree, ReplacingMT, SummingMT, AggregatingMT, MaterializedView, Distributed, Buffer, etc)
- [ ] Combine with database filter: both active simultaneously
- [ ] Show active filter count: "Filtered: 2 engines, 1 database"
- [ ] Quick clear: "Reset filters" link when any filter is active

### Task 3: Database grouping on Schema graph page
- [ ] When multiple databases exist: group nodes visually by database
- [ ] Option A (preferred): dashed container rect per database with database name label, nodes inside
- [ ] Each container has a subtle background tint or border to distinguish databases
- [ ] If only one database — no container, render as before
- [ ] Database filter dropdown on graph page (same as Tables page) to show only one database at a time
- [ ] "All databases" shows everything with grouping

### Task 4: Graph layout with database groups
- [ ] Adjust React Flow layout (dagre or custom) to respect database grouping
- [ ] Nodes within same database are positioned close together
- [ ] Cross-database edges (MV in db1 reading from table in db2) are visually distinct — different dash pattern or color
- [ ] Legend updated: add "database boundary" entry if multiple databases

### Task 5: DDL History — add author column
- [ ] Update system.query_log query to include `user` field (this is the ClickHouse username who executed the DDL)
- [ ] Also include `initial_user` if available (the original user in case of distributed DDL via ON CLUSTER)
- [ ] Show author in timeline: add user badge next to each history entry
- [ ] Style: muted text or small badge, e.g. "user: deploy_bot" or "user: admin"
- [ ] If user field is empty — show "system" as fallback
- [ ] Add author filter: dropdown to filter history by user (useful when multiple people/bots make DDL changes)

### Task 6: DDL History — filter improvements
- [ ] Filter by database (same dropdown component as Tables page, reuse)
- [ ] Filter by operation type: CREATE / ALTER / DROP / RENAME (multi-select chips)
- [ ] Filter by status: success / failed
- [ ] Filter by author (from Task 5)
- [ ] Date range filter: quick presets (today, 7 days, 30 days) + custom range
- [ ] All filters work in combination
- [ ] Show active filter summary: "Showing 12 of 48 changes"

### Task 7: Shared database filter component
- [ ] Extract database filter into reusable component: `src/components/shared/database-filter.tsx`
- [ ] Used on: Tables page, Graph page, History page
- [ ] Synced via zustand store or URL param — selecting database on one page persists when navigating to another
- [ ] Store selected database in URL hash: `/#/tables?db=analytics` so it's shareable

### Task 8: Tests and cleanup
- [ ] Test database filter logic: multiple databases, single database, no tables
- [ ] Test engine filter: combination with database filter
- [ ] Test history author display: with user, without user, initial_user fallback
- [ ] All validation commands pass clean
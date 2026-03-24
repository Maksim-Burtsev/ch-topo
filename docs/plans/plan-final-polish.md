# Plan: Final Polish and 1.0 Release

## Validation Commands
- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`

### Task 1: Dark mode audit
- [ ] Verify every page renders correctly in dark mode
- [ ] React Flow graph: nodes, edges, minimap, background all correct in dark
- [ ] Monaco editor theme matches app dark mode
- [ ] All badges, metric cards, impact cards, timeline dots — check contrast
- [ ] Fix any hardcoded colors that break in dark mode

### Task 2: Loading states audit
- [ ] Every page has skeleton loader while data loads (not spinner)
- [ ] Progressive: Tables page shows immediately from system.tables, detail page waits for columns
- [ ] Graph: nodes appear first, edges animate in
- [ ] Playground: skeleton in results area during query execution
- [ ] Global progress indicator in topbar during schema load

### Task 3: Empty states audit
- [ ] Tables: "No tables found in this database"
- [ ] Graph: "No materialized views — graph shows tables only" (still show table nodes)
- [ ] Impact: "Safe to execute" green card when no deps affected
- [ ] History: "No DDL history found. Check query_log settings."
- [ ] Migrations: explanation that it's optional
- [ ] Playground: "Write a query and press Ctrl+Enter"

### Task 4: Error handling audit
- [ ] ClickHouse unreachable → redirect to connect page with error message
- [ ] One of 6 system queries fails → show partial data + warning badge in topbar
- [ ] query_log access denied → History page shows message, other pages unaffected
- [ ] Playground query error → show error with ClickHouse error message parsed
- [ ] Migration file read error → show which file failed

### Task 5: Responsive layout
- [ ] Minimum width 1024px — no horizontal scroll
- [ ] Sidebar collapses to icons at < 1280px
- [ ] Graph page fills available height
- [ ] Playground editor/results split works at various heights
- [ ] Tables page horizontal scroll for wide tables on narrow screens

### Task 6: README and documentation
- [ ] README.md: one-liner description, feature list, screenshot placeholder, quick start (docker + npx)
- [ ] Quick start: `docker run -p 3000:3000 chtopo/chtopo` (create Dockerfile for static serve with nginx)
- [ ] Features: schema graph, impact analysis, table inspector, DDL history, SQL playground, migrations
- [ ] Stack section
- [ ] Contributing section (brief)
- [ ] License: MIT

### Task 7: Dockerfile
- [ ] Multi-stage: node build + nginx serve
- [ ] `FROM node:20-alpine AS build` → npm ci, npm run build
- [ ] `FROM nginx:alpine` → copy dist/ to /usr/share/nginx/html
- [ ] nginx.conf: SPA fallback (try_files $uri /index.html), gzip on
- [ ] .dockerignore: node_modules, .git, docs
- [ ] Verify: `docker build -t chtopo . && docker run -p 3000:80 chtopo` serves the app

### Task 8: Package.json and metadata
- [ ] version: "1.0.0"
- [ ] description: "Schema intelligence for ClickHouse"
- [ ] repository, homepage, bugs URLs (github.com/you/ch-topo)
- [ ] keywords: clickhouse, schema, dependency-graph, impact-analysis, database, sql
- [ ] license: MIT
- [ ] Create LICENSE file

### Task 9: Final cleanup
- [ ] Remove any unused imports, components, files
- [ ] Remove console.log statements (except console.error)
- [ ] Ensure all TODOs are resolved or converted to GitHub issues
- [ ] Favicon: simple graph/topology icon as SVG
- [ ] document.title updates per page: "Tables — chtopo", "Graph — chtopo", etc
- [ ] All validation commands pass with zero warnings
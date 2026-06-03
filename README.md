# chtopo

Interactive schema topology viewer and impact analyzer for ClickHouse.

`chtopo` is currently a local/developer tool. The browser connects directly to the
ClickHouse HTTP interface, so use it only with trusted local or internal
ClickHouse instances until Server Mode is available.

## Quick Start

```bash
git clone https://github.com/Maksim-Burtsev/ch-topo.git
cd ch-topo
npm install
make dev
```

Open `http://localhost:5173` and connect to the bundled local ClickHouse instance:

- Host: `localhost`
- Port: `8123`
- Database: `default`
- User: `default`
- Password: empty

`make dev` starts ClickHouse through Docker and then starts the Vite dev server.

## Direct Mode

Direct Mode requires the target ClickHouse HTTP interface to be reachable from
the browser. External ClickHouse instances must allow browser CORS requests:

```xml
<allow_origin>*</allow_origin>
```

Direct Mode is not a production security boundary. Do not expose production
ClickHouse credentials to an untrusted browser.

## Local Development

Prerequisites: [Node.js](https://nodejs.org/) 20.19+, 22.13+, or 24+, and
[Docker](https://www.docker.com/). The CI baseline is pinned in `.nvmrc`.

```bash
make install    # install dependencies
make dev        # start ClickHouse in Docker + Vite dev server (http://localhost:5173)
make check      # run typecheck, lint, format check, tests, and production build
```

The UI is designed for desktop/admin workflows. Use a viewport of at least
1024px wide.

## Features

- **Schema Graph** — visualize tables, materialized views, dictionaries and their dependencies with dagre auto-layout
- **Impact Analysis** — simulate `DROP COLUMN`, `MODIFY COLUMN`, `RENAME COLUMN`, `DROP TABLE` and see what breaks before you run it
- **Table Explorer** — browse tables with sorting, filtering by engine, and column-level detail
- **DDL History** — timeline view of DDL operations from `system.query_log`
- **Light/Dark mode** — toggle between themes, persisted to localStorage
- **Keyboard shortcuts** — `1-5` page nav, `/` focus search, `Esc` dismiss

## Stack

- React 19 + TypeScript
- Tailwind CSS 4
- React Flow (xyflow)
- Zustand
- Vite

## License

MIT

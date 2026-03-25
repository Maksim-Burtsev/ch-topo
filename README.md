# chtopo

Interactive schema topology viewer and impact analyzer for ClickHouse.

![Screenshot placeholder](docs/screenshot.png)

## Quick Start

```bash
git clone https://github.com/user/ch-topo.git
cd ch-topo
npm install
npm run dev
```

Make sure your ClickHouse instance has CORS enabled:
```xml
<allow_origin>*</allow_origin>
```

## Local Development

Prerequisites: [Node.js](https://nodejs.org/) 20+ and [Docker](https://www.docker.com/).

```bash
make install    # install dependencies
make dev        # start ClickHouse in Docker + Vite dev server (http://localhost:5173)
```


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

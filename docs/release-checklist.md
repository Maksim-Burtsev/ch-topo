# Release Checklist

Use this checklist for the final 1.0 release PR. Keep evidence links in the PR before tagging.

## README Command Verification

Run the documented commands from `README.md`:

```bash
npm install
make dev
docker build -t chtopo .
docker run --rm -p 8080:8080 chtopo
npm run api:build
HOST=127.0.0.1 PORT=4174 npm run api:start
make install
make check
```

Expected status:

- `npm install`: dependencies install with the supported Node version from `.nvmrc`
- `make dev`: ClickHouse Docker service becomes healthy and Vite serves `http://localhost:5173`
- `docker build`: static SPA image builds
- `docker run`: `GET http://localhost:8080/healthz` returns `ok`
- `npm run api:build`: API TypeScript compiles
- `npm run api:start`: `GET http://127.0.0.1:4174/api/health` returns healthy JSON
- `make check`: typecheck, lint, format check, audit, tests, and build pass

## Fresh Clone Verification

Verify from a directory that has no existing `node_modules`, `dist`, `dist-api`, `dist-cli`, or local storage:

```bash
git clone https://github.com/Maksim-Burtsev/ch-topo.git chtopo-release-check
cd chtopo-release-check
npm ci
npm run build
npm run test:smoke
```

Then run the Docker-backed checks when Docker is available:

```bash
make up
npm run test:integration
make down
```

## Manual Smoke

Record the browser, OS, and ClickHouse version used. Minimum manual flow:

- Demo Mode opens and renders the bundled graph.
- Direct Mode connects to the Docker ClickHouse instance.
- Graph export downloads an SVG.
- Tables page filters and opens a detail page.
- Impact page analyzes a break-level `ALTER TABLE ... DROP COLUMN`.
- Playground allows safe read-only SQL and blocks unsafe SQL.
- DDL History shows rows or a clear permission warning.

## Tagging Rule

Do not create or push a release tag until all of these are attached to the release PR:

- green CI URL for the release PR
- `make check` output from a fresh clone
- Docker image smoke result
- manual browser smoke note
- final version and changelog entry

Tag only from the protected default branch after the release PR is merged.

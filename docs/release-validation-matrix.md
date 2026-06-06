# Release Validation Matrix

This file is the release checklist for the next stable ch-topo cut. Do not mark a row as tested without a matching CI run, local command output, or manual smoke note.

## ClickHouse Versions

| Version | Coverage                                           | Status              |
| ------- | -------------------------------------------------- | ------------------- |
| 24.8    | Docker Compose dev service and CI integration seed | Automated           |
| 25.x    | Latest ClickHouse family compatibility smoke       | Required before 1.0 |

Validation commands:

```bash
npm run test:integration
make check
```

## Browser Versions

| Browser                 | Coverage                                                 | Status              |
| ----------------------- | -------------------------------------------------------- | ------------------- |
| Chromium via Playwright | Smoke tests for connect, demo graph, server schema graph | Automated           |
| Chrome stable           | Manual graph, tables, impact, playground smoke           | Required before 1.0 |
| Firefox stable          | Manual read-only navigation and graph smoke              | Required before 1.0 |
| Safari stable           | Manual layout and localStorage smoke                     | Required before 1.0 |

Validation commands:

```bash
npm run test:smoke
npm run build
```

## Required ClickHouse Permissions

Minimum graph and table browsing:

- `SELECT` on `system.tables`
- `SELECT` on `system.columns`
- `SELECT` on user databases that should appear in topology views

Optional metadata, shown as warnings when unavailable:

- `SELECT` on `system.data_skipping_indices`
- `SELECT` on `system.dictionaries`
- `SELECT` on `system.row_policies`
- `SELECT` on `system.grants`

DDL history:

- `SELECT` on `system.query_log`
- `system.query_log` must be enabled and populated on the ClickHouse server

Direct Mode browser access:

- ClickHouse HTTP interface reachable from the user's browser
- CORS allows ch-topo origin and the request headers documented in `docker/clickhouse/config.d/cors.xml`

Server Mode:

- The ch-topo API process stores ClickHouse credentials in server-side session memory only
- Browser clients must not receive raw ClickHouse passwords

## Known Limitations

- Static impact analysis is not a ClickHouse execution guarantee.
- Unsupported SQL constructs and false-negative classes are listed in `docs/impact-analysis-scope.md`.
- Direct Mode is for local or trusted internal ClickHouse only.
- Desktop/admin viewport is the supported UI target; mobile layout is not release-blocking yet.
- GitHub Action migration impact checks require a sanitized `chtopo-schema.json`.
- Optional metadata permissions can reduce impact-analysis coverage when missing.

## Release Gate

Run and record:

```bash
npm ci
npm run format:check
npm run typecheck
npm run lint
npm run test
npm run test:smoke
npm run test:integration
npm run build
docker build -t chtopo:test .
```

Before tagging 1.0, attach the CI run URL and a short manual browser smoke note to the release PR.

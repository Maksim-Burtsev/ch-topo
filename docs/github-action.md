# GitHub Action

ch-topo includes an MVP pull-request workflow for migration impact checks:

- workflow: `.github/workflows/migration-impact.yml`
- migration paths: `migrations/**/*.sql`, `database/migrations/**/*.sql`, `db/migrations/**/*.sql`
- schema file: `chtopo-schema.json` by default
- CLI command per file: `chtopo check <migration.sql> --schema <schema.json>`
- PR feedback: one editable bot comment plus the job summary

## Schema File

The workflow expects a sanitized JSON file with ClickHouse system-table rows:

```json
{
  "tables": [],
  "columns": [],
  "indices": [],
  "dictionaries": [],
  "rowPolicies": [],
  "grants": []
}
```

`tables` and `columns` are required. The other arrays are optional.

Do not store ClickHouse credentials in this file. The MVP workflow does not connect to ClickHouse and does not need host, user, or password values. If you generate this file from a live database, store credentials only in GitHub Actions secrets used by your generator job, not in `chtopo-schema.json`.

## Configuration

Change `CHTOPO_SCHEMA_PATH` in `.github/workflows/migration-impact.yml` if your schema file is stored elsewhere:

```yaml
env:
  CHTOPO_SCHEMA_PATH: path/to/chtopo-schema.json
```

The workflow fails with:

- exit `1` when any migration has break-level impacts
- exit `2` when the schema file is missing, SQL is unsupported, or the CLI returns an error

The PR comment is updated with `gh pr comment --edit-last --create-if-none`, so repeated pushes keep one current ch-topo summary.

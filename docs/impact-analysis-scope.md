# Impact Analysis Scope

chtopo impact analysis is static schema analysis. It helps find known dependency risks before a DDL change, but it is not a ClickHouse execution guarantee.

## Supported DDL Actions

The Impact page currently parses these actions:

- `DROP TABLE [IF EXISTS] [db.]table`
- `ALTER TABLE [IF EXISTS] [db.]table DROP COLUMN [IF EXISTS] column`
- `ALTER TABLE [IF EXISTS] [db.]table MODIFY COLUMN [IF EXISTS] column type`
- `ALTER TABLE [IF EXISTS] [db.]table RENAME COLUMN [IF EXISTS] old TO new`

The UI builder covers the same action set: drop column, modify column, rename column, and drop table.
In short, the parser covers `ALTER TABLE ... DROP COLUMN`, `ALTER TABLE ... MODIFY COLUMN`, `ALTER TABLE ... RENAME COLUMN`, and `DROP TABLE`.

## Supported Dependency Checks

For column-level actions, chtopo checks known dependencies from the loaded schema graph:

- Materialized view references in `SELECT`, `WHERE`, `GROUP BY`, `JOIN`, and `ORDER BY` clauses.
- Materialized view target tables that may stop receiving rows when a source MV breaks.
- MergeTree `ORDER BY`, `PARTITION BY`, `TTL`, and `SAMPLE BY` expressions.
- Dictionary source tables and key columns.
- Distributed and Buffer table engine targets.
- Skip indexes.
- Default and materialized column expressions.
- Projections and constraints when they are present in parsed table DDL.
- Column-level grants.
- Row policies.

For table-level `DROP TABLE`, chtopo checks known materialized view sources, dictionary sources, MV target tables, Distributed tables, and Buffer tables.

For `MODIFY COLUMN`, chtopo treats type changes as low impact only when the current parser can classify the change as compatible, for example same base type or widening inside supported numeric/date families.

## Unsupported SQL Constructs

These constructs are not fully supported by the current parser and can be missed:

- `ON CLUSTER` modifiers.
- Quoted identifiers beyond simple backticks around word-like names.
- Multi-action `ALTER TABLE` statements.
- `RENAME TABLE`.
- Nested or complex `SELECT` trees in materialized views.
- `WITH` clauses and aliases that materially change source-column resolution.
- Multiple `FROM` sources beyond the first source table in some parser paths.
- Complex `JOIN` source qualification and ambiguous unqualified columns.
- Dynamic SQL, macros, settings-driven behavior, and runtime permissions.
- Dependencies created outside schema metadata available to chtopo.

## Known False-Negative Classes

No-impact output means only that no supported dependency was found in the currently loaded schema graph. Known false-negative classes include:

- Dependencies hidden by unsupported DDL syntax.
- Dependencies hidden by complex materialized view SQL, subqueries, aliases, or `WITH`.
- Columns from joined tables being assigned to the wrong source table.
- `SELECT *` expansion changing after source table edits.
- Projections, constraints, policies, grants, or dictionaries missing from the current ClickHouse user's permissions.
- External consumers outside ClickHouse metadata, such as applications, ETL jobs, dashboards, BI tools, or manually managed SQL.
- Stale local schema data; reload schema before relying on an impact report.

## Recommended Use

Use impact analysis as a review aid:

1. Load schema with a user that can read all relevant metadata.
2. Reload schema immediately before analysis.
3. Treat empty results as "no known impacts detected within supported scope."
4. Review unsupported constructs before running DDL.
5. Validate risky changes against a staging ClickHouse instance.

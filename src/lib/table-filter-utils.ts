import type { RawTableRow } from '@/lib/clickhouse/types'

/** Filter tables by name search, database, and engine filters. */
export function filterTables(
  tables: RawTableRow[],
  nameFilter: string,
  databaseFilter: string,
  engineFilters: string[],
): RawTableRow[] {
  return tables.filter(
    (t) =>
      t.name.toLowerCase().includes(nameFilter.toLowerCase()) &&
      (databaseFilter === '' || t.database === databaseFilter) &&
      (engineFilters.length === 0 || engineFilters.includes(t.engine)),
  )
}

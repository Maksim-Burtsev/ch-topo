import type { BackendClickHouseConnection } from '../clickhouse/types.js'
import {
  COLUMNS_SQL,
  DICTIONARIES_SQL,
  GRANTS_SQL,
  INDICES_SQL,
  ROW_POLICIES_SQL,
  TABLES_SQL,
} from './queries.js'
import type {
  RawColumnRow,
  RawDictionaryRow,
  RawGrantRow,
  RawIndexRow,
  RawRowPolicyRow,
  RawTableRow,
  SchemaPayload,
  SchemaQueryRows,
} from './types.js'

export async function loadSchema(
  connection: BackendClickHouseConnection,
  queryRows: SchemaQueryRows,
): Promise<SchemaPayload> {
  const [tables, columns, indices, dictionaries, rowPolicies, grants] = await Promise.all([
    queryRows<RawTableRow>({ connection, sql: TABLES_SQL }),
    queryRows<RawColumnRow>({ connection, sql: COLUMNS_SQL }),
    queryRows<RawIndexRow>({ connection, sql: INDICES_SQL }),
    queryRows<RawDictionaryRow>({ connection, sql: DICTIONARIES_SQL }),
    queryRows<RawRowPolicyRow>({ connection, sql: ROW_POLICIES_SQL }),
    queryRows<RawGrantRow>({ connection, sql: GRANTS_SQL }),
  ])

  return {
    tables,
    columns,
    indices,
    dictionaries,
    rowPolicies,
    grants,
  }
}

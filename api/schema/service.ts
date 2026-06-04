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
  SchemaWarning,
  SchemaQueryRows,
} from './types.js'

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : 'Unknown ClickHouse schema error'
}

function criticalRows<T>(result: PromiseSettledResult<T[]>): T[] {
  if (result.status === 'fulfilled') return result.value
  throw result.reason instanceof Error ? result.reason : new Error(errorMessage(result.reason))
}

function optionalRows<T>(
  source: SchemaWarning['source'],
  result: PromiseSettledResult<T[]>,
  warnings: SchemaWarning[],
): T[] {
  if (result.status === 'fulfilled') return result.value

  warnings.push({
    source,
    message: errorMessage(result.reason),
  })
  return []
}

export async function loadSchema(
  connection: BackendClickHouseConnection,
  queryRows: SchemaQueryRows,
): Promise<SchemaPayload> {
  const [
    tablesResult,
    columnsResult,
    indicesResult,
    dictionariesResult,
    rowPoliciesResult,
    grantsResult,
  ] = await Promise.allSettled([
    queryRows<RawTableRow>({ connection, sql: TABLES_SQL }),
    queryRows<RawColumnRow>({ connection, sql: COLUMNS_SQL }),
    queryRows<RawIndexRow>({ connection, sql: INDICES_SQL }),
    queryRows<RawDictionaryRow>({ connection, sql: DICTIONARIES_SQL }),
    queryRows<RawRowPolicyRow>({ connection, sql: ROW_POLICIES_SQL }),
    queryRows<RawGrantRow>({ connection, sql: GRANTS_SQL }),
  ])
  const warnings: SchemaWarning[] = []

  return {
    tables: criticalRows(tablesResult),
    columns: criticalRows(columnsResult),
    indices: optionalRows('indices', indicesResult, warnings),
    dictionaries: optionalRows('dictionaries', dictionariesResult, warnings),
    rowPolicies: optionalRows('rowPolicies', rowPoliciesResult, warnings),
    grants: optionalRows('grants', grantsResult, warnings),
    warnings,
  }
}

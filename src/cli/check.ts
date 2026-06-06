import { readFile } from 'node:fs/promises'
import path from 'node:path'
import type {
  RawColumnRow,
  RawDictionaryRow,
  RawGrantRow,
  RawIndexRow,
  RawRowPolicyRow,
  RawTableRow,
} from '@/lib/clickhouse/types'
import { buildDependencyGraph } from '@/lib/graph/build-graph'
import { analyzeImpact } from '@/lib/graph/impact'
import { parseAction } from '@/lib/parser/action-parser'
import type { DDLAction, Impact } from '@/types'

const DEFAULT_SCHEMA_FILE = 'chtopo-schema.json'

interface CliSchemaInput {
  tables: RawTableRow[]
  columns: RawColumnRow[]
  indices: RawIndexRow[]
  dictionaries: RawDictionaryRow[]
  rowPolicies: RawRowPolicyRow[]
  grants: RawGrantRow[]
}

interface CheckArgs {
  migrationPath: string
  schemaPath: string
}

interface CliSummary {
  total: number
  break: number
  stale: number
  warning: number
}

export interface CliCheckOutput {
  command: 'check'
  status: 'pass' | 'fail' | 'error'
  migration?: string
  schema?: string
  action?: DDLAction
  summary: CliSummary
  impacts: Impact[]
  error?: {
    message: string
  }
}

export interface CliRunResult {
  exitCode: number
  stdout: string
  stderr: string
}

class CliError extends Error {
  readonly exitCode: number

  constructor(message: string, exitCode = 2) {
    super(message)
    this.name = 'CliError'
    this.exitCode = exitCode
  }
}

function emptySummary(): CliSummary {
  return { total: 0, break: 0, stale: 0, warning: 0 }
}

function summarizeImpacts(impacts: Impact[]): CliSummary {
  const summary = emptySummary()
  summary.total = impacts.length
  for (const impact of impacts) {
    summary[impact.severity] += 1
  }
  return summary
}

function jsonOutput(output: CliCheckOutput): string {
  return `${JSON.stringify(output, null, 2)}\n`
}

function resolvePath(cwd: string, value: string): string {
  return path.isAbsolute(value) ? value : path.join(cwd, value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasStringFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, string> {
  if (!isRecord(value)) return false
  return fields.every((field) => typeof value[field] === 'string')
}

function isRawTableRow(value: unknown): value is RawTableRow {
  return hasStringFields(value, [
    'database',
    'name',
    'engine',
    'total_rows',
    'total_bytes',
    'data_compressed_bytes',
    'create_table_query',
    'sorting_key',
    'partition_key',
    'metadata_modification_time',
  ])
}

function isRawColumnRow(value: unknown): value is RawColumnRow {
  return hasStringFields(value, [
    'database',
    'table',
    'name',
    'type',
    'default_kind',
    'default_expression',
    'compression_codec',
    'data_compressed_bytes',
    'data_uncompressed_bytes',
  ])
}

function readRequiredRows<T>(
  value: unknown,
  guard: (row: unknown) => row is T,
  field: string,
): T[] {
  if (!Array.isArray(value)) {
    throw new CliError(`Schema file must contain a ${field} array`)
  }
  if (!value.every(guard)) {
    throw new CliError(`Schema file contains invalid ${field} rows`)
  }
  return value
}

function readOptionalRows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

async function readSchema(schemaPath: string): Promise<CliSchemaInput> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await readFile(schemaPath, 'utf8'))
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'unknown error'
    throw new CliError(`Failed to read schema file ${schemaPath}: ${detail}`)
  }

  if (!isRecord(parsed)) {
    throw new CliError('Schema file must contain a JSON object')
  }

  return {
    tables: readRequiredRows(parsed.tables, isRawTableRow, 'tables'),
    columns: readRequiredRows(parsed.columns, isRawColumnRow, 'columns'),
    indices: readOptionalRows<RawIndexRow>(parsed.indices),
    dictionaries: readOptionalRows<RawDictionaryRow>(parsed.dictionaries),
    rowPolicies: readOptionalRows<RawRowPolicyRow>(parsed.rowPolicies),
    grants: readOptionalRows<RawGrantRow>(parsed.grants),
  }
}

function parseCheckArgs(argv: string[]): CheckArgs {
  if (argv[0] !== 'check') {
    throw new CliError('Usage: chtopo check <migration.sql> [--schema chtopo-schema.json]')
  }

  const migrationPath = argv[1]
  if (!migrationPath || migrationPath.startsWith('-')) {
    throw new CliError('Usage: chtopo check <migration.sql> [--schema chtopo-schema.json]')
  }

  let schemaPath = DEFAULT_SCHEMA_FILE
  let index = 2
  while (index < argv.length) {
    const arg = argv[index]
    if (arg === '--schema') {
      const value = argv[index + 1]
      if (!value || value.startsWith('-')) {
        throw new CliError('--schema requires a file path')
      }
      schemaPath = value
      index += 2
      continue
    }
    throw new CliError(`Unknown option: ${arg ?? ''}`)
  }

  return { migrationPath, schemaPath }
}

async function runCheck(argv: string[], cwd: string): Promise<CliRunResult> {
  const args = parseCheckArgs(argv)
  const migrationPath = resolvePath(cwd, args.migrationPath)
  const schemaPath = resolvePath(cwd, args.schemaPath)
  const sql = await readFile(migrationPath, 'utf8')
  const action = parseAction(sql)

  if (!action) {
    return {
      exitCode: 2,
      stdout: jsonOutput({
        command: 'check',
        status: 'error',
        migration: migrationPath,
        schema: schemaPath,
        summary: emptySummary(),
        impacts: [],
        error: { message: 'Unsupported migration statement' },
      }),
      stderr: '',
    }
  }

  const schema = await readSchema(schemaPath)
  const graph = buildDependencyGraph(
    schema.tables,
    schema.columns,
    schema.indices,
    schema.dictionaries,
    schema.rowPolicies,
    schema.grants,
  )
  const impacts = analyzeImpact(action, graph)
  const summary = summarizeImpacts(impacts)
  const status = summary.break > 0 ? 'fail' : 'pass'

  return {
    exitCode: summary.break > 0 ? 1 : 0,
    stdout: jsonOutput({
      command: 'check',
      status,
      migration: migrationPath,
      schema: schemaPath,
      action,
      summary,
      impacts,
    }),
    stderr: '',
  }
}

export async function runCli(argv: string[], cwd = process.cwd()): Promise<CliRunResult> {
  try {
    return await runCheck(argv, cwd)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown CLI error'
    const exitCode = error instanceof CliError ? error.exitCode : 2
    return {
      exitCode,
      stdout: jsonOutput({
        command: 'check',
        status: 'error',
        summary: emptySummary(),
        impacts: [],
        error: { message },
      }),
      stderr: '',
    }
  }
}

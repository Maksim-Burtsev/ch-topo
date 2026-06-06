import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RawColumnRow, RawTableRow } from '@/lib/clickhouse/types'
import { runCli } from '../check'
import type { CliCheckOutput } from '../check'

const table = (name: string, createTableQuery: string): RawTableRow => ({
  database: 'analytics',
  name,
  engine: 'MergeTree',
  total_rows: '0',
  total_bytes: '0',
  data_compressed_bytes: '0',
  create_table_query: createTableQuery,
  sorting_key: 'user_id',
  partition_key: '',
  metadata_modification_time: '2026-06-06 00:00:00',
})

const column = (name: string, type = 'UInt64'): RawColumnRow => ({
  database: 'analytics',
  table: 'events',
  name,
  type,
  default_kind: '',
  default_expression: '',
  compression_codec: '',
  data_compressed_bytes: '0',
  data_uncompressed_bytes: '0',
})

function writeFixture(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'chtopo-cli-'))
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), content)
  }
  return dir
}

function parseOutput(stdout: string): CliCheckOutput {
  return JSON.parse(stdout) as CliCheckOutput
}

describe('runCli check', () => {
  it('returns JSON and exit 1 when a migration has break-level impacts', async () => {
    const dir = writeFixture({
      'migration.sql': 'ALTER TABLE analytics.events DROP COLUMN user_id;',
      'chtopo-schema.json': JSON.stringify({
        tables: [
          table(
            'events',
            'CREATE TABLE analytics.events (user_id UInt64, value String) ENGINE = MergeTree ORDER BY user_id',
          ),
        ],
        columns: [column('user_id'), column('value', 'String')],
      }),
    })

    const result = await runCli(['check', 'migration.sql'], dir)
    const output = parseOutput(result.stdout)

    expect(result.exitCode).toBe(1)
    expect(output.status).toBe('fail')
    expect(output.summary.break).toBeGreaterThan(0)
    expect(output.impacts[0]?.severity).toBe('break')
  })

  it('returns JSON and exit 0 when no break-level impacts are found', async () => {
    const dir = writeFixture({
      'migration.sql': 'ALTER TABLE analytics.events DROP COLUMN value;',
      'chtopo-schema.json': JSON.stringify({
        tables: [
          table(
            'events',
            'CREATE TABLE analytics.events (user_id UInt64, value String) ENGINE = MergeTree ORDER BY user_id',
          ),
        ],
        columns: [column('user_id'), column('value', 'String')],
      }),
    })

    const result = await runCli(['check', 'migration.sql'], dir)
    const output = parseOutput(result.stdout)

    expect(result.exitCode).toBe(0)
    expect(output.status).toBe('pass')
    expect(output.summary.break).toBe(0)
    expect(output.impacts).toEqual([])
  })

  it('returns JSON and exit 2 for unsupported SQL', async () => {
    const dir = writeFixture({
      'migration.sql': 'CREATE TABLE analytics.events (id UInt64);',
      'chtopo-schema.json': JSON.stringify({ tables: [], columns: [] }),
    })

    const result = await runCli(['check', 'migration.sql'], dir)
    const output = parseOutput(result.stdout)

    expect(result.exitCode).toBe(2)
    expect(output.status).toBe('error')
    expect(output.error?.message).toContain('Unsupported migration statement')
  })
})

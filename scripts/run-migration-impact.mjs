#!/usr/bin/env node
import { existsSync, writeFileSync, appendFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const DEFAULT_CLI_PATH = 'dist-cli/chtopo.js'
const DEFAULT_SCHEMA_PATH = 'chtopo-schema.json'
const DEFAULT_COMMENT_FILE = 'migration-impact-comment.md'
const COMMENT_MARKER = '<!-- chtopo:migration-impact -->'

function asSummary(output) {
  return output?.summary ?? { total: 0, break: 0, stale: 0, warning: 0 }
}

function asImpacts(output) {
  return Array.isArray(output?.impacts) ? output.impacts : []
}

function readMessage(output) {
  return typeof output?.error?.message === 'string' ? output.error.message : ''
}

function escapeMarkdown(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function parseArgs(argv) {
  const options = {
    cliPath: DEFAULT_CLI_PATH,
    schemaPath: DEFAULT_SCHEMA_PATH,
    commentFile: DEFAULT_COMMENT_FILE,
    files: [],
  }

  let index = 0
  while (index < argv.length) {
    const arg = argv[index]
    if (arg === '--') {
      options.files.push(...argv.slice(index + 1))
      break
    }
    if (arg === '--cli') {
      options.cliPath = argv[index + 1] ?? DEFAULT_CLI_PATH
      index += 2
      continue
    }
    if (arg === '--schema') {
      options.schemaPath = argv[index + 1] ?? DEFAULT_SCHEMA_PATH
      index += 2
      continue
    }
    if (arg === '--comment-file') {
      options.commentFile = argv[index + 1] ?? DEFAULT_COMMENT_FILE
      index += 2
      continue
    }
    options.files.push(arg ?? '')
    index += 1
  }

  options.files = options.files.filter(Boolean)
  return options
}

function parseJson(stdout, file, exitCode) {
  try {
    return JSON.parse(stdout)
  } catch {
    return {
      status: 'error',
      summary: { total: 0, break: 0, stale: 0, warning: 0 },
      impacts: [],
      error: {
        message: `ch-topo CLI returned non-JSON output for ${file} with exit code ${exitCode}`,
      },
    }
  }
}

function runFileCheck({ cliPath, schemaPath, file }) {
  const result = spawnSync(process.execPath, [cliPath, 'check', file, '--schema', schemaPath], {
    encoding: 'utf8',
  })
  const exitCode = typeof result.status === 'number' ? result.status : 2
  return {
    file,
    exitCode,
    output: parseJson(result.stdout, file, exitCode),
    stderr: result.stderr,
  }
}

export function summarizeOutputs(outputs) {
  const summary = { files: outputs.length, total: 0, break: 0, stale: 0, warning: 0, errors: 0 }
  for (const item of outputs) {
    const itemSummary = asSummary(item.output)
    summary.total += itemSummary.total ?? 0
    summary.break += itemSummary.break ?? 0
    summary.stale += itemSummary.stale ?? 0
    summary.warning += itemSummary.warning ?? 0
    if (item.exitCode >= 2 || item.output?.status === 'error') summary.errors += 1
  }
  return summary
}

export function getExitCode(_outputs, summary) {
  if (summary.errors > 0) return 2
  if (summary.break > 0) return 1
  return 0
}

export function renderMarkdownComment(outputs, summary) {
  const lines = [
    COMMENT_MARKER,
    '## ch-topo migration impact',
    '',
    `Files: ${summary.files} | Total: ${summary.total} | Break: ${summary.break} | Stale: ${summary.stale} | Warning: ${summary.warning} | Errors: ${summary.errors}`,
    '',
  ]

  if (outputs.length === 0) {
    lines.push('No migration SQL files matched this pull request.')
    return `${lines.join('\n')}\n`
  }

  for (const item of outputs) {
    const itemSummary = asSummary(item.output)
    lines.push(`### ${item.file}`)
    lines.push(
      `Status: ${item.output?.status ?? 'error'} | Break: ${itemSummary.break ?? 0} | Stale: ${itemSummary.stale ?? 0} | Warning: ${itemSummary.warning ?? 0}`,
    )

    const message = readMessage(item.output)
    if (message) lines.push(`Error: ${message}`)

    const impacts = asImpacts(item.output)
    if (impacts.length > 0) {
      lines.push('')
      lines.push('| Severity | Object | Reason |')
      lines.push('| --- | --- | --- |')
      for (const impact of impacts.slice(0, 20)) {
        lines.push(
          `| ${escapeMarkdown(impact.severity)} | ${escapeMarkdown(impact.objectName)} | ${escapeMarkdown(impact.reason)} |`,
        )
      }
      if (impacts.length > 20) lines.push(`_Showing first 20 of ${impacts.length} impacts._`)
    }
    lines.push('')
  }

  return `${lines.join('\n')}\n`
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const outputs = options.files.map((file) =>
    runFileCheck({ cliPath: options.cliPath, schemaPath: options.schemaPath, file }),
  )
  const summary = summarizeOutputs(outputs)
  const markdown = renderMarkdownComment(outputs, summary)

  writeFileSync(options.commentFile, markdown)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
  }

  if (!existsSync(options.schemaPath)) {
    console.error(`Schema file not found: ${options.schemaPath}`)
  }
  for (const output of outputs) {
    if (output.stderr) console.error(output.stderr)
  }

  process.exitCode = getExitCode(outputs, summary)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}

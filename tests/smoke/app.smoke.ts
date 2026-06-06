import { expect, test, type Page } from '@playwright/test'

const seededSchema = {
  tables: [
    {
      database: 'analytics',
      name: 'events',
      engine: 'MergeTree',
      total_rows: '1000',
      total_bytes: '1048576',
      data_compressed_bytes: '524288',
      create_table_query: `CREATE TABLE analytics.events
(
    event_date Date,
    user_id UInt64,
    event_type String
)
ENGINE = MergeTree
ORDER BY (event_date, user_id)`,
      sorting_key: 'event_date, user_id',
      partition_key: '',
      metadata_modification_time: '2026-01-01 00:00:00',
    },
    {
      database: 'analytics',
      name: 'daily_stats',
      engine: 'SummingMergeTree',
      total_rows: '10',
      total_bytes: '4096',
      data_compressed_bytes: '2048',
      create_table_query: `CREATE TABLE analytics.daily_stats
(
    stat_date Date,
    user_id UInt64,
    total_events UInt64
)
ENGINE = SummingMergeTree(total_events)
ORDER BY (stat_date, user_id)`,
      sorting_key: 'stat_date, user_id',
      partition_key: '',
      metadata_modification_time: '2026-01-01 00:00:00',
    },
    {
      database: 'analytics',
      name: 'daily_stats_mv',
      engine: 'MaterializedView',
      total_rows: '0',
      total_bytes: '0',
      data_compressed_bytes: '0',
      create_table_query: `CREATE MATERIALIZED VIEW analytics.daily_stats_mv TO analytics.daily_stats
AS SELECT
    event_date AS stat_date,
    user_id,
    count() AS total_events
FROM analytics.events
GROUP BY stat_date, user_id`,
      sorting_key: '',
      partition_key: '',
      metadata_modification_time: '2026-01-01 00:00:00',
    },
  ],
  columns: [
    {
      database: 'analytics',
      table: 'events',
      name: 'event_date',
      type: 'Date',
      default_kind: '',
      default_expression: '',
      compression_codec: '',
      data_compressed_bytes: '0',
      data_uncompressed_bytes: '0',
    },
    {
      database: 'analytics',
      table: 'events',
      name: 'user_id',
      type: 'UInt64',
      default_kind: '',
      default_expression: '',
      compression_codec: '',
      data_compressed_bytes: '0',
      data_uncompressed_bytes: '0',
    },
    {
      database: 'analytics',
      table: 'events',
      name: 'event_type',
      type: 'String',
      default_kind: '',
      default_expression: '',
      compression_codec: '',
      data_compressed_bytes: '0',
      data_uncompressed_bytes: '0',
    },
    {
      database: 'analytics',
      table: 'daily_stats',
      name: 'stat_date',
      type: 'Date',
      default_kind: '',
      default_expression: '',
      compression_codec: '',
      data_compressed_bytes: '0',
      data_uncompressed_bytes: '0',
    },
    {
      database: 'analytics',
      table: 'daily_stats',
      name: 'user_id',
      type: 'UInt64',
      default_kind: '',
      default_expression: '',
      compression_codec: '',
      data_compressed_bytes: '0',
      data_uncompressed_bytes: '0',
    },
    {
      database: 'analytics',
      table: 'daily_stats',
      name: 'total_events',
      type: 'UInt64',
      default_kind: '',
      default_expression: '',
      compression_codec: '',
      data_compressed_bytes: '0',
      data_uncompressed_bytes: '0',
    },
  ],
  indices: [],
  dictionaries: [],
  rowPolicies: [],
  grants: [],
  warnings: [],
}

function collectRuntimeErrors(page: Page) {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => {
    errors.push(error.message)
  })
  return errors
}

function expectNoUnexpectedRuntimeErrors(errors: string[], allowedSubstrings: string[] = []) {
  const unexpected = errors.filter(
    (error) => !allowedSubstrings.some((allowed) => error.includes(allowed)),
  )
  expect(unexpected).toEqual([])
}

test('app loads and lands on connect without a session', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.goto('/')

  await expect(page).toHaveURL(/#\/connect$/)
  await expect(page).toHaveTitle('chtopo — Connect')
  await expect(page.getByRole('heading', { name: 'Connect to ClickHouse' })).toBeVisible()
  await expect(page.locator('#root')).not.toBeEmpty()
  expectNoUnexpectedRuntimeErrors(errors)
})

test('connect page renders server and direct modes', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.goto('/#/connect')

  await expect(page.getByRole('button', { name: 'Server Mode', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Direct Mode', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Demo Mode', exact: true })).toBeVisible()
  await expect(page.locator('form input')).toHaveCount(5)
  const inputValues = await page.locator('form input').evaluateAll((inputs) =>
    inputs.map((input) => {
      if (input instanceof HTMLInputElement) return input.value
      return ''
    }),
  )
  expect(inputValues).toEqual(['localhost', '8123', 'default', 'default', ''])
  expectNoUnexpectedRuntimeErrors(errors)
})

test('demo mode renders bundled graph without a ClickHouse connection', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.goto('/#/connect')
  await page.getByRole('button', { name: 'Demo Mode', exact: true }).click()
  await page.getByRole('button', { name: 'Explore Demo Mode' }).click()

  await expect(page).toHaveURL(/#\/$/)
  await expect(page.locator('header')).toContainText('Demo')
  await expect(page.locator('header')).toContainText('Sample schema')
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(page.getByText('daily_stats_mv')).toBeVisible()
  expectNoUnexpectedRuntimeErrors(errors)
})

test('failed server connection renders a user-facing error', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.route('**/api/connect', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'ClickHouse unavailable' }),
    })
  })

  await page.goto('/#/connect')
  await page.getByRole('button', { name: 'Connect via Server Mode' }).click()

  await expect(page.getByText('ClickHouse unavailable')).toBeVisible()
  expectNoUnexpectedRuntimeErrors(errors, [
    'Failed to load resource: the server responded with a status of 500',
  ])
})

test('seeded server-mode schema renders the graph', async ({ page }) => {
  const errors = collectRuntimeErrors(page)

  await page.route('**/api/connect', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'connected' }),
    })
  })
  await page.route('**/api/schema', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(seededSchema),
    })
  })

  await page.goto('/#/connect')
  await page.getByRole('button', { name: 'Connect via Server Mode' }).click()

  await expect(page).toHaveURL(/#\/$/)
  await expect(page).toHaveTitle('chtopo — Schema Graph')
  await expect(page.locator('.react-flow')).toBeVisible()
  await expect(page.getByText('daily_stats_mv')).toBeVisible()
  expect(await page.locator('.react-flow__node').count()).toBeGreaterThan(0)
  expectNoUnexpectedRuntimeErrors(errors)
})

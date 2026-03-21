import { describe, expect, it } from 'vitest'
import { parseDDL } from '../ddl-parser'
import { extractColumnRefs } from '../extract-columns'

// ─── MergeTree Family ────────────────────────────────────────────────

describe('MergeTree parser', () => {
  it('parses simple MergeTree with ORDER BY and PARTITION BY', () => {
    const ddl = `CREATE TABLE analytics.events
(
    event_date Date,
    user_id UInt64,
    event_type LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, user_id, event_type)
SETTINGS index_granularity = 8192`

    const cols = new Set(['event_date', 'user_id', 'event_type'])
    const result = parseDDL(ddl, 'MergeTree', cols)

    expect(result.database).toBe('analytics')
    expect(result.name).toBe('events')
    expect(result.engine).toBe('MergeTree')
    expect(result.orderByColumns).toEqual(['event_date', 'user_id', 'event_type'])
    expect(result.partitionByColumns).toEqual(['event_date'])
    expect(result.settings).toEqual({ index_granularity: '8192' })
  })

  it('parses MergeTree with TTL', () => {
    const ddl = `CREATE TABLE analytics.events
(
    event_date Date,
    user_id UInt64
)
ENGINE = MergeTree
ORDER BY (event_date, user_id)
TTL event_date + INTERVAL 90 DAY
SETTINGS index_granularity = 8192`

    const cols = new Set(['event_date', 'user_id'])
    const result = parseDDL(ddl, 'MergeTree', cols)

    expect(result.ttlColumns).toEqual(['event_date'])
  })

  it('parses MergeTree with SAMPLE BY', () => {
    const ddl = `CREATE TABLE analytics.events
(
    event_date Date,
    user_id UInt64
)
ENGINE = MergeTree
ORDER BY (event_date, user_id)
SAMPLE BY intHash32(user_id)
SETTINGS index_granularity = 8192`

    const cols = new Set(['event_date', 'user_id'])
    const result = parseDDL(ddl, 'MergeTree', cols)

    expect(result.sampleByColumn).toBe('user_id')
  })

  it('parses ReplicatedMergeTree (ORDER BY still works)', () => {
    const ddl = `CREATE TABLE analytics.events_replicated
(
    event_date Date,
    user_id UInt64,
    event_type String
)
ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/events', '{replica}')
ORDER BY (event_date, user_id)
PARTITION BY toYYYYMM(event_date)
SETTINGS index_granularity = 8192`

    const cols = new Set(['event_date', 'user_id', 'event_type'])
    const result = parseDDL(ddl, 'ReplicatedMergeTree', cols)

    expect(result.orderByColumns).toEqual(['event_date', 'user_id'])
    expect(result.partitionByColumns).toEqual(['event_date'])
  })

  it('parses SummingMergeTree', () => {
    const ddl = `CREATE TABLE analytics.daily_stats
(
    stat_date Date,
    event_type LowCardinality(String),
    total_events UInt64,
    unique_users UInt64,
    total_revenue Decimal(18, 2)
)
ENGINE = SummingMergeTree((total_events, unique_users, total_revenue))
PARTITION BY toYYYYMM(stat_date)
ORDER BY (stat_date, event_type)
SETTINGS index_granularity = 8192`

    const cols = new Set([
      'stat_date',
      'event_type',
      'total_events',
      'unique_users',
      'total_revenue',
    ])
    const result = parseDDL(ddl, 'SummingMergeTree', cols)

    expect(result.orderByColumns).toEqual(['stat_date', 'event_type'])
    expect(result.partitionByColumns).toEqual(['stat_date'])
  })

  it('parses AggregatingMergeTree', () => {
    const ddl = `CREATE TABLE analytics.user_funnels
(
    funnel_date Date,
    funnel_name LowCardinality(String),
    step_1_users AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(funnel_date)
ORDER BY (funnel_date, funnel_name)
SETTINGS index_granularity = 8192`

    const cols = new Set(['funnel_date', 'funnel_name', 'step_1_users'])
    const result = parseDDL(ddl, 'AggregatingMergeTree', cols)

    expect(result.orderByColumns).toEqual(['funnel_date', 'funnel_name'])
    expect(result.partitionByColumns).toEqual(['funnel_date'])
  })

  it('parses ORDER BY with single column (no parens)', () => {
    const ddl = `CREATE TABLE analytics.users
(
    user_id UInt64,
    name String
)
ENGINE = ReplacingMergeTree(last_seen_at)
ORDER BY user_id
SETTINGS index_granularity = 8192`

    const cols = new Set(['user_id', 'name'])
    const result = parseDDL(ddl, 'ReplacingMergeTree', cols)

    expect(result.orderByColumns).toEqual(['user_id'])
  })

  it('parses full mock events table DDL', () => {
    const ddl = `CREATE TABLE analytics.events
(
    event_id UUID DEFAULT generateUUIDv4(),
    event_date Date,
    event_time DateTime64(3),
    user_id UInt64,
    session_id String,
    event_type LowCardinality(String),
    page_url String,
    referrer String,
    utm_source LowCardinality(String),
    utm_medium LowCardinality(String),
    utm_campaign String,
    device_type LowCardinality(String),
    browser LowCardinality(String),
    os LowCardinality(String),
    country LowCardinality(String),
    city String,
    region_id UInt32,
    revenue Decimal(18, 2),
    duration_ms UInt32,
    is_bounce UInt8
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, user_id, event_type)
TTL event_date + INTERVAL 90 DAY
SAMPLE BY intHash32(user_id)
SETTINGS index_granularity = 8192`

    const cols = new Set([
      'event_id',
      'event_date',
      'event_time',
      'user_id',
      'session_id',
      'event_type',
      'page_url',
      'referrer',
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'device_type',
      'browser',
      'os',
      'country',
      'city',
      'region_id',
      'revenue',
      'duration_ms',
      'is_bounce',
    ])
    const result = parseDDL(ddl, 'MergeTree', cols)

    expect(result.database).toBe('analytics')
    expect(result.name).toBe('events')
    expect(result.orderByColumns).toEqual(['event_date', 'user_id', 'event_type'])
    expect(result.partitionByColumns).toEqual(['event_date'])
    expect(result.ttlColumns).toEqual(['event_date'])
    expect(result.sampleByColumn).toBe('user_id')
    expect(result.settings).toEqual({ index_granularity: '8192' })
  })
})

// ─── MaterializedView ────────────────────────────────────────────────

describe('MaterializedView parser', () => {
  it('parses simple MV with TO and FROM', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.daily_stats_mv TO analytics.daily_stats
AS SELECT
    toDate(event_date) AS stat_date,
    event_type,
    count() AS total_events,
    uniq(user_id) AS unique_users,
    sum(revenue) AS total_revenue,
    avg(duration_ms) AS avg_duration,
    avg(is_bounce) AS bounce_rate
FROM analytics.events
GROUP BY stat_date, event_type`

    const cols = new Set([
      'event_date',
      'event_type',
      'user_id',
      'revenue',
      'duration_ms',
      'is_bounce',
      'stat_date',
    ])
    const result = parseDDL(ddl, 'MaterializedView', cols)

    expect(result.targetTable).toBe('analytics.daily_stats')
    expect(result.sourceTable).toBe('analytics.events')
    expect(result.selectsAll).toBe(false)

    const selectCols = result.referencedColumns
      .filter((r) => r.context === 'select')
      .map((r) => r.column)
    expect(selectCols).toContain('event_date')
    expect(selectCols).toContain('event_type')
    expect(selectCols).toContain('user_id')
    expect(selectCols).toContain('revenue')
    expect(selectCols).toContain('duration_ms')
    expect(selectCols).toContain('is_bounce')

    const groupByCols = result.referencedColumns
      .filter((r) => r.context === 'group_by')
      .map((r) => r.column)
    expect(groupByCols).toContain('stat_date')
    expect(groupByCols).toContain('event_type')
  })

  it('parses MV with GROUP BY', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.agg_mv TO analytics.agg_target
AS SELECT
    user_id,
    count() AS cnt
FROM analytics.events
GROUP BY user_id`

    const cols = new Set(['user_id', 'cnt'])
    const result = parseDDL(ddl, 'MaterializedView', cols)

    const groupByCols = result.referencedColumns
      .filter((r) => r.context === 'group_by')
      .map((r) => r.column)
    expect(groupByCols).toContain('user_id')
  })

  it('parses MV with JOIN USING', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.joined_mv TO analytics.joined_target
AS SELECT
    e.event_date,
    s.session_id,
    e.user_id
FROM analytics.events e
JOIN analytics.sessions s USING (user_id)
WHERE e.is_bounce = 0
GROUP BY event_date, session_id, user_id`

    const cols = new Set(['event_date', 'session_id', 'user_id', 'is_bounce'])
    const result = parseDDL(ddl, 'MaterializedView', cols)

    expect(result.sourceTable).toBe('analytics.events')

    const joinCols = result.referencedColumns
      .filter((r) => r.context === 'join')
      .map((r) => r.column)
    expect(joinCols).toContain('user_id')

    const whereCols = result.referencedColumns
      .filter((r) => r.context === 'where')
      .map((r) => r.column)
    expect(whereCols).toContain('is_bounce')
  })

  it('detects SELECT *', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.all_mv TO analytics.all_target
AS SELECT * FROM analytics.events`

    const result = parseDDL(ddl, 'MaterializedView', new Set())

    expect(result.selectsAll).toBe(true)
    expect(result.sourceTable).toBe('analytics.events')
    expect(result.targetTable).toBe('analytics.all_target')
  })

  it('parses MV with functions: uniqExact(col), count(), sum(col)', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.func_mv TO analytics.func_target
AS SELECT
    uniqExact(user_id) AS uu,
    count() AS events,
    sum(revenue) AS total_rev
FROM analytics.events
GROUP BY event_date`

    const cols = new Set(['user_id', 'revenue', 'event_date'])
    const result = parseDDL(ddl, 'MaterializedView', cols)

    const selectCols = result.referencedColumns
      .filter((r) => r.context === 'select')
      .map((r) => r.column)
    expect(selectCols).toContain('user_id')
    expect(selectCols).toContain('revenue')
  })

  it('parses MV with expressions: toDate(col), if(cond, a, b)', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.expr_mv TO analytics.expr_target
AS SELECT
    toDate(event_date) AS d,
    if(is_bounce, 1, 0) AS bounce_flag,
    user_id
FROM analytics.events`

    const cols = new Set(['event_date', 'is_bounce', 'user_id'])
    const result = parseDDL(ddl, 'MaterializedView', cols)

    const selectCols = result.referencedColumns
      .filter((r) => r.context === 'select')
      .map((r) => r.column)
    expect(selectCols).toContain('event_date')
    expect(selectCols).toContain('is_bounce')
    expect(selectCols).toContain('user_id')
  })

  it('parses MV with table alias', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.alias_mv TO analytics.alias_target
AS SELECT
    e.event_date,
    e.user_id
FROM analytics.events AS e`

    const cols = new Set(['event_date', 'user_id'])
    const result = parseDDL(ddl, 'MaterializedView', cols)

    expect(result.sourceTable).toBe('analytics.events')
    const selectCols = result.referencedColumns
      .filter((r) => r.context === 'select')
      .map((r) => r.column)
    expect(selectCols).toContain('event_date')
    expect(selectCols).toContain('user_id')
  })

  it('parses MV without TO (implicit target)', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.implicit_mv
AS SELECT
    event_date,
    count() AS cnt
FROM analytics.events
GROUP BY event_date`

    const cols = new Set(['event_date'])
    const result = parseDDL(ddl, 'MaterializedView', cols)

    expect(result.targetTable).toBeNull()
    expect(result.sourceTable).toBe('analytics.events')
  })

  it('parses the full mock daily_stats_mv DDL', () => {
    const ddl = `CREATE MATERIALIZED VIEW analytics.daily_stats_mv TO analytics.daily_stats
AS SELECT
    toDate(event_date) AS stat_date,
    event_type,
    count() AS total_events,
    uniq(user_id) AS unique_users,
    sum(revenue) AS total_revenue,
    avg(duration_ms) AS avg_duration,
    avg(is_bounce) AS bounce_rate
FROM analytics.events
GROUP BY stat_date, event_type`

    const cols = new Set([
      'event_date',
      'event_type',
      'user_id',
      'revenue',
      'duration_ms',
      'is_bounce',
      'stat_date',
    ])
    const result = parseDDL(ddl, 'MaterializedView', cols)

    expect(result.database).toBe('analytics')
    expect(result.name).toBe('daily_stats_mv')
    expect(result.sourceTable).toBe('analytics.events')
    expect(result.targetTable).toBe('analytics.daily_stats')

    const allRefCols = result.referencedColumns.map((r) => r.column)
    expect(allRefCols).toContain('event_date')
    expect(allRefCols).toContain('user_id')
    expect(allRefCols).toContain('revenue')
    expect(allRefCols).toContain('duration_ms')
    expect(allRefCols).toContain('is_bounce')
  })
})

// ─── extractColumnRefs ───────────────────────────────────────────────

describe('extractColumnRefs', () => {
  it('extracts column from toYYYYMM(event_date)', () => {
    const cols = new Set(['event_date', 'user_id'])
    const result = extractColumnRefs('toYYYYMM(event_date)', cols)
    expect(result).toEqual(['event_date'])
  })

  it('extracts column from TTL expression: event_date + INTERVAL 90 DAY', () => {
    const cols = new Set(['event_date', 'user_id'])
    const result = extractColumnRefs('event_date + INTERVAL 90 DAY', cols)
    expect(result).toEqual(['event_date'])
  })

  it('extracts multiple columns from complex expression', () => {
    const cols = new Set(['a', 'b', 'c'])
    const result = extractColumnRefs('func(a, b) + c', cols)
    expect(result).toEqual(['a', 'b', 'c'])
  })

  it('does not capture SQL keywords or function names', () => {
    const cols = new Set(['event_date'])
    const result = extractColumnRefs('toYYYYMM(event_date)', cols)
    // "toYYYYMM" should not be in the result since it's not in knownColumns
    expect(result).toEqual(['event_date'])
    expect(result).not.toContain('toYYYYMM')
  })

  it('returns empty for expressions with no known columns', () => {
    const cols = new Set(['x', 'y'])
    const result = extractColumnRefs('func(a, b)', cols)
    expect(result).toEqual([])
  })
})

// ─── Edge cases ──────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles unknown engine gracefully', () => {
    const ddl = `CREATE TABLE analytics.memory_table (id UInt64) ENGINE = Memory`
    const result = parseDDL(ddl, 'Memory', new Set(['id']))

    expect(result.database).toBe('analytics')
    expect(result.name).toBe('memory_table')
    expect(result.engine).toBe('Memory')
    expect(result.orderByColumns).toEqual([])
  })

  it('handles empty DDL', () => {
    const result = parseDDL('', 'MergeTree', new Set())
    expect(result.name).toBe('')
    expect(result.orderByColumns).toEqual([])
  })

  it('handles CollapsingMergeTree', () => {
    const ddl = `CREATE TABLE analytics.collapsing
(
    user_id UInt64,
    event_date Date,
    sign Int8
)
ENGINE = CollapsingMergeTree(sign)
ORDER BY (user_id, event_date)`

    const cols = new Set(['user_id', 'event_date', 'sign'])
    const result = parseDDL(ddl, 'CollapsingMergeTree', cols)

    expect(result.orderByColumns).toEqual(['user_id', 'event_date'])
  })
})

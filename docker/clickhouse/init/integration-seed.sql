DROP DATABASE IF EXISTS chtopo_it;
CREATE DATABASE chtopo_it;

CREATE TABLE chtopo_it.events
(
    event_date Date,
    event_time DateTime,
    user_id UInt64,
    region_id UInt32,
    event_type LowCardinality(String),
    revenue Decimal(18, 2),
    INDEX idx_event_type event_type TYPE set(100) GRANULARITY 4,
    PROJECTION user_revenue_projection
    (
        SELECT user_id, sum(revenue)
        GROUP BY user_id
    ),
    CONSTRAINT positive_user CHECK user_id > 0
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, user_id);

CREATE TABLE chtopo_it.users
(
    user_id UInt64,
    plan LowCardinality(String),
    country LowCardinality(String),
    updated_at DateTime
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY user_id;

CREATE TABLE chtopo_it.regions_source
(
    region_id UInt32,
    region_name String,
    country_code String
)
ENGINE = MergeTree
ORDER BY region_id;

CREATE DICTIONARY chtopo_it.regions
(
    region_id UInt32,
    region_name String,
    country_code String
)
PRIMARY KEY region_id
SOURCE(CLICKHOUSE(
    db 'chtopo_it'
    table 'regions_source'
))
LAYOUT(FLAT())
LIFETIME(MIN 0 MAX 0);

CREATE TABLE chtopo_it.daily_stats
(
    stat_date Date,
    user_id UInt64,
    total_revenue Decimal(18, 2)
)
ENGINE = SummingMergeTree(total_revenue)
ORDER BY (stat_date, user_id);

CREATE MATERIALIZED VIEW chtopo_it.daily_stats_mv TO chtopo_it.daily_stats
AS SELECT
    event_date AS stat_date,
    user_id,
    sum(revenue) AS total_revenue
FROM chtopo_it.events
GROUP BY stat_date, user_id;

CREATE TABLE chtopo_it.event_user_stats
(
    stat_date Date,
    user_id UInt64,
    plan LowCardinality(String),
    total_revenue Decimal(18, 2),
    events UInt64
)
ENGINE = SummingMergeTree((total_revenue, events))
ORDER BY (stat_date, user_id, plan);

CREATE MATERIALIZED VIEW chtopo_it.event_user_stats_mv TO chtopo_it.event_user_stats
AS SELECT
    e.event_date AS stat_date,
    e.user_id,
    u.plan,
    sum(e.revenue) AS total_revenue,
    count() AS events
FROM
(
    SELECT event_date, user_id, event_type, revenue
    FROM chtopo_it.events
    WHERE revenue > 0
) AS e
INNER JOIN chtopo_it.users AS u ON e.user_id = u.user_id
WHERE e.event_type != 'internal'
GROUP BY stat_date, e.user_id, u.plan;

CREATE TABLE chtopo_it.events_local
(
    event_date Date,
    user_id UInt64,
    event_type LowCardinality(String),
    revenue Decimal(18, 2)
)
ENGINE = MergeTree
ORDER BY (event_date, user_id);

CREATE TABLE chtopo_it.events_distributed AS chtopo_it.events_local
ENGINE = Distributed('default', currentDatabase(), 'events_local', rand());

CREATE TABLE chtopo_it.events_buffer AS chtopo_it.events_local
ENGINE = Buffer(currentDatabase(), 'events_local', 16, 10, 100, 10000, 100000, 10000000, 100000000);

CREATE ROLE IF NOT EXISTS integration_reader;
GRANT SELECT(user_id, event_type) ON chtopo_it.events TO integration_reader;
CREATE ROW POLICY IF NOT EXISTS active_user_filter ON chtopo_it.events
FOR SELECT USING user_id > 0 AND event_type != 'internal' TO integration_reader;

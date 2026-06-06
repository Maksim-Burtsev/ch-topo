DROP DATABASE IF EXISTS chtopo_it;
CREATE DATABASE chtopo_it;

CREATE TABLE chtopo_it.events
(
    event_date Date,
    user_id UInt64,
    event_type LowCardinality(String),
    revenue Decimal(18, 2),
    INDEX idx_event_type event_type TYPE set(100) GRANULARITY 4
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, user_id)
CONSTRAINT positive_user CHECK user_id > 0;

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

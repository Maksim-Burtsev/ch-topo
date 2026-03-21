-- ═══════════════════════════════════════════════════════════════════
-- ch-topo dev seed: analytics schema with realistic data
-- ═══════════════════════════════════════════════════════════════════

CREATE DATABASE IF NOT EXISTS analytics;

-- ─── Source Tables ───────────────────────────────────────────────

CREATE TABLE analytics.events
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
    is_bounce UInt8,
    INDEX idx_event_type event_type TYPE set(100) GRANULARITY 4,
    INDEX idx_user_revenue (user_id, revenue) TYPE minmax GRANULARITY 3,
    INDEX idx_country country TYPE bloom_filter(0.01) GRANULARITY 1
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (event_date, user_id, event_type, intHash32(user_id))
TTL event_date + INTERVAL 90 DAY
SAMPLE BY intHash32(user_id)
SETTINGS index_granularity = 8192;

CREATE TABLE analytics.sessions
(
    session_id String,
    session_date Date,
    user_id UInt64,
    start_time DateTime64(3),
    end_time DateTime64(3),
    page_views UInt16,
    events_count UInt32,
    duration_sec UInt32,
    entry_page String,
    exit_page String,
    is_bounce UInt8
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(session_date)
ORDER BY (session_date, user_id)
TTL session_date + INTERVAL 180 DAY
SETTINGS index_granularity = 8192;

CREATE TABLE analytics.users
(
    user_id UInt64,
    created_at DateTime,
    email String,
    name String,
    country LowCardinality(String),
    plan LowCardinality(String),
    is_active UInt8,
    last_seen_at DateTime,
    total_events UInt64,
    ltv Decimal(18, 2)
)
ENGINE = ReplacingMergeTree(last_seen_at)
ORDER BY user_id
SETTINGS index_granularity = 8192;

CREATE TABLE analytics.raw_events
(
    timestamp DateTime64(3),
    source LowCardinality(String),
    event_json String,
    user_id UInt64,
    ip_address IPv4,
    user_agent String,
    request_id UUID,
    processed UInt8 DEFAULT 0
)
ENGINE = MergeTree
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (timestamp, source)
TTL toDateTime(timestamp) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- ─── Target Tables (for MVs) ────────────────────────────────────

CREATE TABLE analytics.daily_stats
(
    stat_date Date,
    event_type LowCardinality(String),
    total_events UInt64,
    unique_users UInt64,
    total_revenue Decimal(18, 2),
    avg_duration Float64,
    bounce_rate Float64
)
ENGINE = SummingMergeTree((total_events, unique_users, total_revenue))
PARTITION BY toYYYYMM(stat_date)
ORDER BY (stat_date, event_type)
SETTINGS index_granularity = 8192;

CREATE TABLE analytics.user_funnels
(
    funnel_date Date,
    funnel_name LowCardinality(String),
    step_1_users AggregateFunction(uniq, UInt64),
    step_2_users AggregateFunction(uniq, UInt64),
    step_3_users AggregateFunction(uniq, UInt64),
    step_4_users AggregateFunction(uniq, UInt64),
    total_revenue AggregateFunction(sum, Decimal(18, 2))
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(funnel_date)
ORDER BY (funnel_date, funnel_name)
SETTINGS index_granularity = 8192;

CREATE TABLE analytics.hourly_pageviews
(
    hour DateTime,
    page_url String,
    views UInt64,
    unique_users UInt64
)
ENGINE = SummingMergeTree((views, unique_users))
ORDER BY (hour, page_url)
SETTINGS index_granularity = 8192;

-- ─── Materialized Views ─────────────────────────────────────────

CREATE MATERIALIZED VIEW analytics.daily_stats_mv TO analytics.daily_stats
AS SELECT
    toDate(event_date) AS stat_date,
    event_type,
    count() AS total_events,
    uniq(user_id) AS unique_users,
    sum(revenue) AS total_revenue,
    avg(duration_ms) AS avg_duration,
    avg(is_bounce) AS bounce_rate
FROM analytics.events
GROUP BY stat_date, event_type;

CREATE MATERIALIZED VIEW analytics.user_funnels_mv TO analytics.user_funnels
AS SELECT
    toDate(event_date) AS funnel_date,
    'main_funnel' AS funnel_name,
    uniqState(user_id) AS step_1_users,
    uniqStateIf(user_id, event_type = 'signup') AS step_2_users,
    uniqStateIf(user_id, event_type = 'purchase') AS step_3_users,
    uniqStateIf(user_id, event_type = 'repeat_purchase') AS step_4_users,
    sumState(revenue) AS total_revenue
FROM analytics.events
GROUP BY funnel_date, funnel_name;

CREATE MATERIALIZED VIEW analytics.hourly_pageviews_mv TO analytics.hourly_pageviews
AS SELECT
    toStartOfHour(event_time) AS hour,
    page_url,
    count() AS views,
    uniq(user_id) AS unique_users
FROM analytics.events
GROUP BY hour, page_url;

-- ─── Dictionary Source + Dictionary ─────────────────────────────

CREATE TABLE analytics.regions_source
(
    region_id UInt32,
    region_name String,
    country_code String
)
ENGINE = MergeTree
ORDER BY region_id;

INSERT INTO analytics.regions_source VALUES
    (1, 'California', 'US'), (2, 'Texas', 'US'), (3, 'New York', 'US'),
    (4, 'Florida', 'US'), (5, 'Illinois', 'US'), (6, 'Ontario', 'CA'),
    (7, 'Quebec', 'CA'), (8, 'England', 'GB'), (9, 'Bavaria', 'DE'),
    (10, 'Ile-de-France', 'FR'), (11, 'Moscow', 'RU'), (12, 'Tokyo', 'JP'),
    (13, 'Sao Paulo', 'BR'), (14, 'New South Wales', 'AU'), (15, 'Maharashtra', 'IN');

CREATE DICTIONARY analytics.regions
(
    region_id UInt32,
    region_name String,
    country_code String
)
PRIMARY KEY region_id
SOURCE(CLICKHOUSE(
    db 'analytics'
    table 'regions_source'
))
LAYOUT(FLAT())
LIFETIME(MIN 300 MAX 600);

-- ─── Distributed + Buffer (for graph edge testing) ──────────────

CREATE TABLE analytics.events_local
(
    event_id UUID,
    event_date Date,
    user_id UInt64,
    event_type LowCardinality(String),
    revenue Decimal(18, 2)
)
ENGINE = MergeTree
ORDER BY (event_date, user_id);

CREATE TABLE analytics.events_distributed AS analytics.events_local
ENGINE = Distributed('default', 'analytics', 'events_local', rand());

CREATE TABLE analytics.events_buffer AS analytics.events_local
ENGINE = Buffer('analytics', 'events_local', 16, 10, 100, 10000, 100000, 10000000, 100000000);

-- ─── Access Control ─────────────────────────────────────────────

CREATE ROLE IF NOT EXISTS analyst_role;
CREATE ROLE IF NOT EXISTS marketing_role;

-- Column-level grants
GRANT SELECT(user_id, event_type, event_date, revenue) ON analytics.events TO analyst_role;
GRANT SELECT(utm_source, utm_medium, utm_campaign) ON analytics.events TO marketing_role;
GRANT SELECT(user_id, email, plan) ON analytics.users TO analyst_role;

-- Row policy
CREATE ROW POLICY IF NOT EXISTS country_filter ON analytics.events FOR SELECT USING country = 'US' TO analyst_role;

-- ─── Seed Data: Users ───────────────────────────────────────────

INSERT INTO analytics.users
SELECT
    number + 1 AS user_id,
    now() - toIntervalDay(rand() % 730) AS created_at,
    concat('user', toString(number + 1), '@example.com') AS email,
    concat(
        arrayElement(['Alex','Maria','John','Emma','Carlos','Yuki','Ahmed','Sophie','Ivan','Li'], (rand() % 10) + 1),
        ' ',
        arrayElement(['Smith','Garcia','Kim','Mueller','Silva','Tanaka','Hassan','Martin','Petrov','Wang'], (rand() % 10) + 1)
    ) AS name,
    arrayElement(['US','GB','DE','FR','CA','JP','BR','AU','IN','RU'], (rand() % 10) + 1) AS country,
    arrayElement(['free','starter','pro','enterprise'], (rand() % 4) + 1) AS plan,
    if(rand() % 100 < 80, 1, 0) AS is_active,
    now() - toIntervalHour(rand() % 720) AS last_seen_at,
    rand() % 5000 AS total_events,
    toDecimal64((rand() % 50000) / 100, 2) AS ltv
FROM numbers(5000);

-- ─── Seed Data: Events (last 60 days) ───────────────────────────

INSERT INTO analytics.events
SELECT
    generateUUIDv4() AS event_id,
    today() - toIntervalDay(rand() % 60) AS event_date,
    now() - toIntervalSecond(rand() % (60 * 86400)) AS event_time,
    (rand() % 5000) + 1 AS user_id,
    toString(generateUUIDv4()) AS session_id,
    arrayElement(
        ['pageview','click','signup','purchase','repeat_purchase','search','scroll','video_play','form_submit','share'],
        (rand() % 10) + 1
    ) AS event_type,
    concat('https://example.com/', arrayElement(['home','pricing','docs','blog','about','contact','signup','dashboard','settings','help'], (rand() % 10) + 1)) AS page_url,
    if(rand() % 3 = 0, concat('https://', arrayElement(['google.com','twitter.com','linkedin.com','github.com','reddit.com'], (rand() % 5) + 1)), '') AS referrer,
    if(rand() % 2 = 0, arrayElement(['google','facebook','twitter','linkedin','email','direct'], (rand() % 6) + 1), '') AS utm_source,
    if(rand() % 2 = 0, arrayElement(['cpc','organic','social','email','referral'], (rand() % 5) + 1), '') AS utm_medium,
    if(rand() % 3 = 0, arrayElement(['spring_sale','product_launch','newsletter_q1','retarget_v2','brand_awareness'], (rand() % 5) + 1), '') AS utm_campaign,
    arrayElement(['desktop','mobile','tablet'], (rand() % 3) + 1) AS device_type,
    arrayElement(['Chrome','Firefox','Safari','Edge','Opera'], (rand() % 5) + 1) AS browser,
    arrayElement(['Windows','macOS','Linux','iOS','Android'], (rand() % 5) + 1) AS os,
    arrayElement(['US','GB','DE','FR','CA','JP','BR','AU','IN','RU'], (rand() % 10) + 1) AS country,
    arrayElement(['New York','London','Berlin','Paris','Toronto','Tokyo','Sao Paulo','Sydney','Mumbai','Moscow'], (rand() % 10) + 1) AS city,
    (rand() % 15) + 1 AS region_id,
    if(rand() % 5 = 0, toDecimal64((rand() % 20000) / 100, 2), toDecimal64(0, 2)) AS revenue,
    rand() % 300000 AS duration_ms,
    if(rand() % 100 < 35, 1, 0) AS is_bounce
FROM numbers(500000);

-- ─── Seed Data: Sessions ────────────────────────────────────────

INSERT INTO analytics.sessions
SELECT
    toString(generateUUIDv4()) AS session_id,
    today() - toIntervalDay(rand() % 60) AS session_date,
    (rand() % 5000) + 1 AS user_id,
    now() - toIntervalSecond(rand() % (60 * 86400)) AS start_time,
    now() - toIntervalSecond(rand() % (60 * 86400) - (rand() % 3600)) AS end_time,
    (rand() % 20) + 1 AS page_views,
    (rand() % 50) + 1 AS events_count,
    rand() % 3600 AS duration_sec,
    concat('https://example.com/', arrayElement(['home','pricing','docs','blog','about'], (rand() % 5) + 1)) AS entry_page,
    concat('https://example.com/', arrayElement(['signup','pricing','contact','docs','home'], (rand() % 5) + 1)) AS exit_page,
    if(rand() % 100 < 35, 1, 0) AS is_bounce
FROM numbers(100000);

-- ─── Seed Data: Raw Events ──────────────────────────────────────

INSERT INTO analytics.raw_events
SELECT
    now() - toIntervalSecond(rand() % (7 * 86400)) AS timestamp,
    arrayElement(['web','ios','android','api'], (rand() % 4) + 1) AS source,
    concat('{"event":"', arrayElement(['click','view','purchase'], (rand() % 3) + 1), '","value":', toString(rand() % 1000), '}') AS event_json,
    (rand() % 5000) + 1 AS user_id,
    toIPv4(concat(toString(10 + rand() % 240), '.', toString(rand() % 256), '.', toString(rand() % 256), '.', toString(1 + rand() % 254))) AS ip_address,
    concat('Mozilla/5.0 (', arrayElement(['Windows NT 10.0','Macintosh','Linux x86_64','iPhone','Android'], (rand() % 5) + 1), ')') AS user_agent,
    generateUUIDv4() AS request_id,
    if(rand() % 100 < 90, 1, 0) AS processed
FROM numbers(200000);

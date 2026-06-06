import { describe, expect, it } from 'vitest'
import { ping } from '@/lib/clickhouse/client'
import {
  fetchColumns,
  fetchDictionaries,
  fetchGrants,
  fetchIndices,
  fetchRowPolicies,
  fetchTables,
} from '@/lib/clickhouse/queries'
import type { ConnectionParams } from '@/lib/clickhouse/types'
import { buildDependencyGraph } from '@/lib/graph/build-graph'
import { analyzeImpact } from '@/lib/graph/impact'

const integrationEnv = import.meta.env as Record<string, string | undefined>
const runIntegration = integrationEnv.VITE_CHTOPO_INTEGRATION === '1' ? describe : describe.skip

const connection: ConnectionParams = {
  host: integrationEnv.VITE_CHTOPO_CLICKHOUSE_HOST ?? '127.0.0.1',
  port: Number(integrationEnv.VITE_CHTOPO_CLICKHOUSE_HTTP_PORT ?? 8124),
  database: 'default',
  user: 'default',
  password: '',
}

runIntegration('ClickHouse integration harness', () => {
  it('fetches real metadata, builds graph, and analyzes impact', async () => {
    await ping(connection)

    const [tables, columns, indices, dictionaries, rowPolicies, grants] = await Promise.all([
      fetchTables(connection),
      fetchColumns(connection),
      fetchIndices(connection),
      fetchDictionaries(connection),
      fetchRowPolicies(connection),
      fetchGrants(connection),
    ])

    const graph = buildDependencyGraph(tables, columns, indices, dictionaries, rowPolicies, grants)

    expect(tables.some((table) => table.database === 'chtopo_it' && table.name === 'events')).toBe(
      true,
    )
    expect(graph.mvSources.get('chtopo_it.daily_stats_mv')).toEqual(['chtopo_it.events'])
    expect(graph.mvSources.get('chtopo_it.event_user_stats_mv')).toEqual([
      'chtopo_it.events',
      'chtopo_it.users',
    ])
    expect(graph.columnToMVs.get('chtopo_it.events.user_id')).toContainEqual({
      mvName: 'chtopo_it.daily_stats_mv',
      usageContext: 'select',
    })
    expect(graph.columnToMVs.get('chtopo_it.users.user_id')).toContainEqual({
      mvName: 'chtopo_it.event_user_stats_mv',
      usageContext: 'join',
    })
    expect(graph.columnToMVs.get('chtopo_it.users.plan')).toContainEqual({
      mvName: 'chtopo_it.event_user_stats_mv',
      usageContext: 'select',
    })
    expect(graph.indexColumns.get('chtopo_it.events.idx_event_type')).toEqual(['event_type'])
    expect(graph.projectionColumns.get('chtopo_it.events.user_revenue_projection')).toEqual([
      'user_id',
      'revenue',
    ])
    expect(graph.constraintColumns.get('chtopo_it.events.positive_user')).toEqual(['user_id'])
    expect(graph.dictSources.get('chtopo_it.regions')).toEqual({
      sourceTable: 'chtopo_it.regions_source',
      keyColumns: ['region_id'],
    })
    expect(graph.columnGrants.get('chtopo_it.events.user_id')).toContain('integration_reader')
    expect(
      Array.from(graph.rowPolicies.values()).some(
        (policy) =>
          policy.table === 'chtopo_it.events' &&
          policy.columns.includes('user_id') &&
          policy.columns.includes('event_type'),
      ),
    ).toBe(true)
    expect(graph.distributedTables.get('chtopo_it.events_distributed')).toBe(
      'chtopo_it.events_local',
    )
    expect(graph.bufferTables.get('chtopo_it.events_buffer')).toBe('chtopo_it.events_local')

    const impacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'chtopo_it.events', column: 'user_id' },
      graph,
    )

    expect(
      impacts.some((impact) => impact.objectType === 'mv' && impact.severity === 'break'),
    ).toBe(true)
    expect(
      impacts.some((impact) => impact.objectType === 'order_by' && impact.severity === 'break'),
    ).toBe(true)
    expect(
      impacts.some((impact) => impact.objectType === 'projection' && impact.severity === 'warning'),
    ).toBe(true)
    expect(
      impacts.some((impact) => impact.objectType === 'constraint' && impact.severity === 'warning'),
    ).toBe(true)
    expect(
      impacts.some((impact) => impact.objectType === 'grant' && impact.severity === 'warning'),
    ).toBe(true)
    expect(
      impacts.some((impact) => impact.objectType === 'row_policy' && impact.severity === 'warning'),
    ).toBe(true)

    const regionImpacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'chtopo_it.regions_source', column: 'region_id' },
      graph,
    )
    expect(
      regionImpacts.some(
        (impact) => impact.objectType === 'dictionary' && impact.severity === 'break',
      ),
    ).toBe(true)

    const localImpacts = analyzeImpact(
      { type: 'DROP_COLUMN', table: 'chtopo_it.events_local', column: 'user_id' },
      graph,
    )
    expect(
      localImpacts.some(
        (impact) => impact.objectType === 'distributed' && impact.severity === 'stale',
      ),
    ).toBe(true)
    expect(
      localImpacts.some((impact) => impact.objectType === 'buffer' && impact.severity === 'stale'),
    ).toBe(true)
  }, 120_000)
})

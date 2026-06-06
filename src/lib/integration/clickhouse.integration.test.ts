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
    expect(graph.columnToMVs.get('chtopo_it.events.user_id')).toContainEqual({
      mvName: 'chtopo_it.daily_stats_mv',
      usageContext: 'select',
    })
    expect(graph.indexColumns.get('chtopo_it.events.idx_event_type')).toEqual(['event_type'])
    expect(graph.constraintColumns.get('chtopo_it.events.positive_user')).toEqual(['user_id'])

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
  }, 120_000)
})

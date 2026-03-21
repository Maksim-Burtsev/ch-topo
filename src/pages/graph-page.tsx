import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Edge, Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { SchemaNode } from '@/components/graph/schema-node'
import type { RawTableRow } from '@/lib/clickhouse/types'
import type { DependencyGraph } from '@/lib/graph/types'
import { formatNumber } from '@/lib/utils'
import { useGraphStore } from '@/stores/graph-store'
import { useSchemaStore } from '@/stores/schema-store'

const nodeTypes = { schema: SchemaNode }

function getNodeType(
  table: RawTableRow,
  targetTableNames: Set<string>,
): 'source' | 'mv' | 'target' {
  if (/materializedview/i.test(table.engine)) return 'mv'
  const fqn = `${table.database}.${table.name}`
  if (targetTableNames.has(fqn)) return 'target'
  return 'source'
}

function buildGraphData(
  tables: RawTableRow[],
  dictionaries: { name: string; database: string }[],
  graph: DependencyGraph | null,
) {
  const nodes: Node[] = []
  const edges: Edge[] = []

  // Collect target table names from graph
  const targetTableNames = new Set<string>()
  if (graph) {
    for (const target of graph.mvTargets.values()) {
      if (target) targetTableNames.add(target)
    }
  }

  const sources: RawTableRow[] = []
  const mvs: RawTableRow[] = []
  const targets: RawTableRow[] = []

  for (const t of tables) {
    const nt = getNodeType(t, targetTableNames)
    if (nt === 'mv') mvs.push(t)
    else if (nt === 'target') targets.push(t)
    else sources.push(t)
  }

  const sourceX = 50
  const mvX = 400
  const targetX = 750

  sources.forEach((t, i) => {
    const id = `${t.database}.${t.name}`
    nodes.push({
      id,
      type: 'schema',
      position: { x: sourceX, y: i * 120 },
      data: {
        label: t.name,
        engine: t.engine,
        nodeType: 'source',
        rows: formatNumber(Number(t.total_rows) || 0),
      },
    })
  })

  mvs.forEach((t, i) => {
    const id = `${t.database}.${t.name}`
    nodes.push({
      id,
      type: 'schema',
      position: { x: mvX, y: i * 120 },
      data: {
        label: t.name,
        engine: 'MaterializedView',
        nodeType: 'mv',
      },
    })
  })

  targets.forEach((t, i) => {
    const id = `${t.database}.${t.name}`
    nodes.push({
      id,
      type: 'schema',
      position: { x: targetX, y: i * 120 },
      data: {
        label: t.name,
        engine: t.engine,
        nodeType: 'target',
        rows: formatNumber(Number(t.total_rows) || 0),
      },
    })
  })

  const dictY = targets.length * 120 + 50
  dictionaries.forEach((d, i) => {
    const id = `dict_${d.database}.${d.name}`
    nodes.push({
      id,
      type: 'schema',
      position: { x: targetX, y: dictY + i * 120 },
      data: {
        label: d.name,
        engine: 'Dictionary',
        nodeType: 'dictionary',
      },
    })
  })

  // Build edges from graph data
  if (graph) {
    for (const [mvName, sourcesList] of graph.mvSources) {
      for (const src of sourcesList) {
        edges.push({
          id: `e-${src}-${mvName}`,
          source: src,
          target: mvName,
          style: { strokeDasharray: '6 3', stroke: '#a855f7' },
          animated: true,
        })
      }
    }

    for (const [mvName, target] of graph.mvTargets) {
      if (target) {
        edges.push({
          id: `e-${mvName}-${target}`,
          source: mvName,
          target,
          style: { stroke: '#f87171' },
        })
      }
    }

    for (const [dictName, dep] of graph.dictSources) {
      const dictNodeId = `dict_${dictName}`
      edges.push({
        id: `e-${dep.sourceTable}-${dictNodeId}`,
        source: dep.sourceTable,
        target: dictNodeId,
        style: { strokeDasharray: '2 4', stroke: '#fbbf24' },
      })
    }

    for (const [distName, localTable] of graph.distributedTables) {
      edges.push({
        id: `e-${distName}-${localTable}`,
        source: distName,
        target: localTable,
        style: { strokeDasharray: '4 2', stroke: '#60a5fa' },
      })
    }
  }

  return { nodes, edges }
}

export function GraphPage() {
  const tables = useSchemaStore((s) => s.tables)
  const dictionaries = useSchemaStore((s) => s.dictionaries)
  const tablesReady = useSchemaStore((s) => s.tablesReady)
  const graph = useGraphStore((s) => s.graph)

  const computed = useMemo(
    () => buildGraphData(tables, dictionaries, graph),
    [tables, dictionaries, graph],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])

  useEffect(() => {
    setNodes(computed.nodes)
  }, [computed.nodes, setNodes])

  useEffect(() => {
    setEdges(computed.edges)
  }, [computed.edges, setEdges])

  if (!tablesReady) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-7rem)] -m-6 relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const nt = (node.data as { nodeType: string }).nodeType
            if (nt === 'mv') return '#a855f7'
            if (nt === 'target') return '#f87171'
            if (nt === 'dictionary') return '#fbbf24'
            return '#22c55e'
          }}
          maskColor="rgba(0,0,0,0.6)"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-4 rounded-lg border border-border bg-card/90 backdrop-blur px-4 py-2.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          Source Table
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
          Materialized View
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
          Target Table
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
          Dictionary
        </span>
        <span className="flex items-center gap-1.5 ml-2 border-l border-border pl-4">
          <span className="w-6 border-t-2 border-dashed border-purple-500" />
          MV reads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-6 border-t-2 border-red-400" />
          MV writes
        </span>
      </div>
    </div>
  )
}

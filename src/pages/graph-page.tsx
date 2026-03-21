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
import { SchemaNode } from '@/components/graph/schema-node'
import { mockDictionaries, mockTables } from '@/lib/mock/data'
import { formatNumber } from '@/lib/utils'

const nodeTypes = { schema: SchemaNode }

function getNodeType(engine: string): 'source' | 'mv' | 'target' | 'dictionary' {
  if (engine === 'MaterializedView') return 'mv'
  if (engine === 'SummingMergeTree' || engine === 'AggregatingMergeTree') return 'target'
  return 'source'
}

function buildGraph() {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const sourceX = 50
  const mvX = 400
  const targetX = 750
  const dictX = 750

  let sourceY = 0
  let mvY = 0
  let targetY = 0

  const sources: string[] = []
  const mvs: string[] = []
  const targets: string[] = []

  for (const t of mockTables) {
    const nt = getNodeType(t.engine)
    if (nt === 'mv') mvs.push(t.name)
    else if (nt === 'target') targets.push(t.name)
    else sources.push(t.name)
  }

  for (const name of sources) {
    const t = mockTables.find((x) => x.name === name)
    if (!t) continue
    nodes.push({
      id: name,
      type: 'schema',
      position: { x: sourceX, y: sourceY },
      data: {
        label: name,
        engine: t.engine,
        nodeType: 'source',
        rows: formatNumber(t.total_rows),
      },
    })
    sourceY += 120
  }

  for (const name of mvs) {
    nodes.push({
      id: name,
      type: 'schema',
      position: { x: mvX, y: mvY },
      data: {
        label: name,
        engine: 'MaterializedView',
        nodeType: 'mv',
      },
    })
    mvY += 120
  }

  for (const name of targets) {
    const t = mockTables.find((x) => x.name === name)
    if (!t) continue
    nodes.push({
      id: name,
      type: 'schema',
      position: { x: targetX, y: targetY },
      data: {
        label: name,
        engine: t.engine,
        nodeType: 'target',
        rows: formatNumber(t.total_rows),
      },
    })
    targetY += 120
  }

  for (const d of mockDictionaries) {
    nodes.push({
      id: `dict_${d.name}`,
      type: 'schema',
      position: { x: dictX, y: targetY + 50 },
      data: {
        label: d.name,
        engine: 'Dictionary',
        nodeType: 'dictionary',
      },
    })
  }

  edges.push({
    id: 'e-events-daily_stats_mv',
    source: 'events',
    target: 'daily_stats_mv',
    style: { strokeDasharray: '6 3', stroke: '#a855f7' },
    animated: true,
  })
  edges.push({
    id: 'e-daily_stats_mv-daily_stats',
    source: 'daily_stats_mv',
    target: 'daily_stats',
    style: { stroke: '#f87171' },
  })
  edges.push({
    id: 'e-events-user_funnels_mv',
    source: 'events',
    target: 'user_funnels_mv',
    style: { strokeDasharray: '6 3', stroke: '#a855f7' },
    animated: true,
  })
  edges.push({
    id: 'e-user_funnels_mv-user_funnels',
    source: 'user_funnels_mv',
    target: 'user_funnels',
    style: { stroke: '#f87171' },
  })
  edges.push({
    id: 'e-dict_regions-events',
    source: 'events',
    target: 'dict_regions',
    style: { strokeDasharray: '2 4', stroke: '#fbbf24' },
  })

  return { nodes, edges }
}

const { nodes: initialNodes, edges: initialEdges } = buildGraph()

export function GraphPage() {
  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

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

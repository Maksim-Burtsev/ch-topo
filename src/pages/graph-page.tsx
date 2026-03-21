import dagre from '@dagrejs/dagre'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Edge, Node, NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SchemaNode } from '@/components/graph/schema-node'
import { TableDetailPanel } from '@/components/graph/table-detail-panel'
import { Select } from '@/components/ui/select'
import type { RawTableRow } from '@/lib/clickhouse/types'
import type { DependencyGraph } from '@/lib/graph/types'
import { formatBytes, formatNumber } from '@/lib/utils'
import { useGraphStore } from '@/stores/graph-store'
import { useSchemaStore } from '@/stores/schema-store'
import { useThemeStore } from '@/stores/theme-store'

const nodeTypes = { schema: SchemaNode }

const NODE_WIDTH = 180
const NODE_HEIGHT = 70
const MIN_NODE_HEIGHT = 60
const MAX_NODE_HEIGHT = 100

function getNodeType(
  table: RawTableRow,
  targetTableNames: Set<string>,
): 'source' | 'mv' | 'target' {
  if (/materializedview/i.test(table.engine)) return 'mv'
  const fqn = `${table.database}.${table.name}`
  if (targetTableNames.has(fqn)) return 'target'
  return 'source'
}

function getNodeHeight(table: RawTableRow): number {
  const bytes = Number(table.total_bytes) || 0
  if (bytes <= 0) return MIN_NODE_HEIGHT
  const logVal = Math.log10(bytes + 1)
  const normalized = Math.min(logVal / 12, 1)
  return MIN_NODE_HEIGHT + normalized * (MAX_NODE_HEIGHT - MIN_NODE_HEIGHT)
}

function layoutWithDagre(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'LR', ranksep: 200, nodesep: 40, edgesep: 20 })

  for (const node of nodes) {
    const h = (node.data as { height?: number }).height ?? NODE_HEIGHT
    g.setNode(node.id, { width: NODE_WIDTH, height: h })
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target)
  }

  dagre.layout(g)

  return nodes.map((node) => {
    const pos = g.node(node.id) as { x: number; y: number }
    const h = (node.data as { height?: number }).height ?? NODE_HEIGHT
    return {
      ...node,
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - h / 2 },
    }
  })
}

function buildGraphData(
  tables: RawTableRow[],
  dictionaries: { name: string; database: string }[],
  graph: DependencyGraph | null,
  databaseFilter: string,
) {
  const nodes: Node[] = []
  const edges: Edge[] = []

  const filteredTables = databaseFilter
    ? tables.filter((t) => t.database === databaseFilter)
    : tables

  const targetTableNames = new Set<string>()
  if (graph) {
    for (const target of graph.mvTargets.values()) {
      if (target) targetTableNames.add(target)
    }
  }

  for (const t of filteredTables) {
    const id = `${t.database}.${t.name}`
    const nt = getNodeType(t, targetTableNames)
    const h = nt === 'mv' ? MIN_NODE_HEIGHT : getNodeHeight(t)
    nodes.push({
      id,
      type: 'schema',
      position: { x: 0, y: 0 },
      data: {
        label: t.name,
        engine: nt === 'mv' ? 'MaterializedView' : t.engine,
        nodeType: nt,
        rows: nt !== 'mv' ? formatNumber(Number(t.total_rows) || 0) : undefined,
        size: nt !== 'mv' ? formatBytes(Number(t.total_bytes) || 0) : undefined,
        height: h,
      },
    })
  }

  const filteredDicts = databaseFilter
    ? dictionaries.filter((d) => d.database === databaseFilter)
    : dictionaries

  for (const d of filteredDicts) {
    const id = `dict_${d.database}.${d.name}`
    nodes.push({
      id,
      type: 'schema',
      position: { x: 0, y: 0 },
      data: {
        label: d.name,
        engine: 'Dictionary',
        nodeType: 'dictionary',
        height: MIN_NODE_HEIGHT,
      },
    })
  }

  const nodeIds = new Set(nodes.map((n) => n.id))

  if (graph) {
    for (const [mvName, sourcesList] of graph.mvSources) {
      for (const src of sourcesList) {
        if (nodeIds.has(src) && nodeIds.has(mvName)) {
          edges.push({
            id: `e-${src}-${mvName}`,
            source: src,
            target: mvName,
            style: { strokeDasharray: '6 3', stroke: '#a855f7' },
            animated: true,
          })
        }
      }
    }

    for (const [mvName, target] of graph.mvTargets) {
      if (target && nodeIds.has(mvName) && nodeIds.has(target)) {
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
      if (nodeIds.has(dep.sourceTable) && nodeIds.has(dictNodeId)) {
        edges.push({
          id: `e-${dep.sourceTable}-${dictNodeId}`,
          source: dep.sourceTable,
          target: dictNodeId,
          style: { strokeDasharray: '2 4', stroke: '#fbbf24' },
        })
      }
    }

    for (const [distName, localTable] of graph.distributedTables) {
      if (nodeIds.has(distName) && nodeIds.has(localTable)) {
        edges.push({
          id: `e-${distName}-${localTable}`,
          source: distName,
          target: localTable,
          style: { strokeDasharray: '4 2', stroke: '#60a5fa' },
        })
      }
    }
  }

  const laidOutNodes = layoutWithDagre(nodes, edges)
  return { nodes: laidOutNodes, edges }
}

function getConnectedIds(nodeId: string, edges: Edge[]): Set<string> {
  const ids = new Set<string>()
  ids.add(nodeId)
  for (const e of edges) {
    if (e.source === nodeId || e.target === nodeId) {
      ids.add(e.source)
      ids.add(e.target)
    }
  }
  return ids
}

export function GraphPage() {
  const tables = useSchemaStore((s) => s.tables)
  const columns = useSchemaStore((s) => s.columns)
  const allIndices = useSchemaStore((s) => s.indices)
  const dictionaries = useSchemaStore((s) => s.dictionaries)
  const tablesReady = useSchemaStore((s) => s.tablesReady)
  const graph = useGraphStore((s) => s.graph)
  const theme = useThemeStore((s) => s.theme)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [databaseFilter, setDatabaseFilter] = useState('')

  const databases = useMemo(() => {
    const set = new Set(tables.map((t) => t.database))
    return [...set].sort()
  }, [tables])

  const computed = useMemo(
    () => buildGraphData(tables, dictionaries, graph, databaseFilter),
    [tables, dictionaries, graph, databaseFilter],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])

  useEffect(() => {
    setNodes(computed.nodes)
  }, [computed.nodes, setNodes])

  useEffect(() => {
    setEdges(computed.edges)
  }, [computed.edges, setEdges])

  // Highlight connected nodes/edges on selection
  const { highlightedIds, selectedNodeId } = useMemo(() => {
    if (!selectedId) return { highlightedIds: null, selectedNodeId: null }
    let matchId: string | null = null
    if (computed.nodes.some((n) => n.id === selectedId)) {
      matchId = selectedId
    } else if (computed.nodes.some((n) => n.id === `dict_${selectedId}`)) {
      matchId = `dict_${selectedId}`
    }
    if (!matchId) return { highlightedIds: null, selectedNodeId: null }
    return { highlightedIds: getConnectedIds(matchId, computed.edges), selectedNodeId: matchId }
  }, [selectedId, computed.nodes, computed.edges])

  useEffect(() => {
    if (!highlightedIds) {
      setNodes((nds) =>
        nds.map((n) => ({ ...n, className: '', data: { ...n.data, selected: false } })),
      )
      setEdges((eds) => eds.map((e) => ({ ...e, className: '', style: { ...e.style } })))
      return
    }

    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        className: highlightedIds.has(n.id) ? '' : 'opacity-20',
        data: { ...n.data, selected: n.id === selectedNodeId },
      })),
    )
    setEdges((eds) =>
      eds.map((e) => {
        const connected = highlightedIds.has(e.source) && highlightedIds.has(e.target)
        return {
          ...e,
          className: connected ? '' : 'opacity-10',
        }
      }),
    )
  }, [highlightedIds, selectedNodeId, setNodes, setEdges])

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const tableId = node.id.startsWith('dict_') ? node.id.slice(5) : node.id
    setSelectedId(tableId)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedId(null)
  }, [])

  // Resolve selected table data
  const selectedTable = useMemo(() => {
    if (!selectedId) return null
    const [db, name] = selectedId.split('.')
    return tables.find((t) => t.database === db && t.name === name) ?? null
  }, [selectedId, tables])

  const selectedColumns = useMemo(() => {
    if (!selectedId) return []
    const [db, name] = selectedId.split('.')
    return columns.filter((c) => c.database === db && c.table === name)
  }, [selectedId, columns])

  // Navigate to a dependency node in the graph
  const handleNavigate = useCallback(
    (tableId: string) => {
      const nodeExists = computed.nodes.some((n) => n.id === tableId || n.id === `dict_${tableId}`)
      if (nodeExists) {
        setSelectedId(tableId)
      }
    },
    [computed.nodes],
  )

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    data: { label: string; engine: string; rows?: string; size?: string }
  } | null>(null)
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout>>(null)

  const onNodeMouseEnter: NodeMouseHandler = useCallback(
    (_event, node) => {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current)
      const tableId = node.id.startsWith('dict_') ? node.id.slice(5) : node.id
      if (selectedId === tableId) return
      const d = node.data as { label: string; engine: string; rows?: string; size?: string }
      const rect = (_event.target as HTMLElement)
        .closest('.react-flow__node')
        ?.getBoundingClientRect()
      if (rect) {
        setTooltip({
          x: rect.right + 8,
          y: rect.top,
          data: d,
        })
      }
    },
    [selectedId],
  )

  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => {
    tooltipTimeout.current = setTimeout(() => {
      setTooltip(null)
    }, 100)
  }, [])

  // Keyboard: Esc closes detail panel
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedId(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [])

  if (!tablesReady) {
    return (
      <div className="flex flex-col gap-4 -m-6 p-6">
        <div className="h-8 w-48 rounded bg-muted animate-pulse" />
        <div className="flex-1 min-h-[calc(100vh-10rem)] rounded-lg border border-border bg-muted/30 animate-pulse" />
      </div>
    )
  }

  const hasMVs = tables.some((t) => /materializedview/i.test(t.engine))

  return (
    <div className="h-[calc(100vh-7rem)] -m-6 relative flex">
      <div className="flex-1 relative">
        {/* Toolbar */}
        {databases.length > 1 && (
          <div className="absolute top-3 left-3 z-10">
            <Select
              value={databaseFilter}
              onChange={(e) => {
                setDatabaseFilter(e.target.value)
                setSelectedId(null)
              }}
              className="w-40 h-8 text-xs bg-card"
            >
              <option value="">All databases</option>
              {databases.map((db) => (
                <option key={db} value={db}>
                  {db}
                </option>
              ))}
            </Select>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseLeave={onNodeMouseLeave}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.3}
          maxZoom={2}
          colorMode={theme}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color={theme === 'dark' ? '#27272a' : '#cbd5e1'}
          />
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

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 rounded-lg border border-border bg-card px-3 py-2 shadow-lg text-xs pointer-events-none"
            style={{ left: tooltip.x, top: tooltip.y }}
          >
            <div className="font-semibold">{tooltip.data.label}</div>
            <div className="text-muted-foreground">{tooltip.data.engine}</div>
            {tooltip.data.rows && (
              <div className="text-muted-foreground">{tooltip.data.rows} rows</div>
            )}
            {tooltip.data.size && <div className="text-muted-foreground">{tooltip.data.size}</div>}
          </div>
        )}

        {/* Empty state: no MVs */}
        {computed.nodes.length > 0 && !hasMVs && (
          <div className="absolute top-3 right-3 z-10 rounded-lg border border-border bg-card/90 backdrop-blur px-3 py-2 text-xs text-muted-foreground max-w-[220px]">
            No materialized views — graph shows tables only.
          </div>
        )}

        {/* Empty state: no tables */}
        {computed.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center text-sm text-muted-foreground">
              <p className="font-medium">No tables found</p>
              <p className="mt-1 text-xs">
                {databaseFilter
                  ? `No tables in database "${databaseFilter}".`
                  : 'No tables found in this ClickHouse instance.'}
              </p>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-14 flex items-center gap-4 rounded-lg border border-border bg-card/90 backdrop-blur px-4 py-2.5 text-xs">
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

      {/* Detail Panel */}
      {selectedTable && selectedId && (
        <TableDetailPanel
          tableId={selectedId}
          table={selectedTable}
          columns={selectedColumns}
          indices={allIndices}
          graph={graph}
          onClose={() => {
            setSelectedId(null)
          }}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  )
}

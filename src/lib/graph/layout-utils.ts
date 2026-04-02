import type { Edge, Node } from '@xyflow/react'

const DEFAULT_NODE_HEIGHT = 70

/**
 * Filter out Dictionary-engine tables that have a matching entry in the dictionaries list.
 * ClickHouse creates both a system.tables row (engine=Dictionary) and a system.dictionaries
 * row for each dictionary — we keep only the dictionary node to avoid duplicates.
 */
export function filterDictTables<T extends { database: string; name: string; engine: string }>(
  tables: T[],
  dictionaries: { database: string; name: string }[],
): T[] {
  const dictKeys = new Set(dictionaries.map((d) => `${d.database}.${d.name}`))
  return tables.filter(
    (t) => !(t.engine === 'Dictionary' && dictKeys.has(`${t.database}.${t.name}`)),
  )
}

/**
 * Align 1-to-1 connected node pairs so edges between them are perfectly horizontal.
 * For each edge where the source has exactly one outgoing edge and the target has
 * exactly one incoming edge, set the target's Y center to match the source's Y center.
 * Processes left-to-right so alignments cascade through chains.
 */
/**
 * Attach parentId to child nodes and convert their positions from absolute to
 * relative (within their database group). Used to make database groups draggable
 * as a unit in React Flow.
 */
export function attachParentIds(
  nodes: Node[],
  groupNodes: Node[],
  getDatabase: (nodeId: string) => string,
): Node[] {
  if (groupNodes.length === 0) return nodes

  const groupPositions: Record<string, { x: number; y: number }> = {}
  for (const gn of groupNodes) {
    const db = (gn.data as { label: string }).label
    groupPositions[db] = gn.position
  }

  return nodes.map((node) => {
    if (node.type === 'database-group' || node.type === 'unlinked-header') return node
    const db = getDatabase(node.id)
    const gp = groupPositions[db]
    if (!gp) return node
    return {
      ...node,
      parentId: `__db_group_${db}__`,
      expandParent: true,
      position: { x: node.position.x - gp.x, y: node.position.y - gp.y },
    }
  })
}

export function alignOneToOnePairs(nodes: Node[], edges: Edge[]): void {
  const outDeg: Record<string, number> = {}
  const inDeg: Record<string, number> = {}
  for (const edge of edges) {
    outDeg[edge.source] = (outDeg[edge.source] ?? 0) + 1
    inDeg[edge.target] = (inDeg[edge.target] ?? 0) + 1
  }

  const nodeById: Record<string, Node> = {}
  for (const node of nodes) {
    nodeById[node.id] = node
  }

  const sortedEdges = [...edges].sort((a, b) => {
    const ax = nodeById[a.source]?.position.x ?? 0
    const bx = nodeById[b.source]?.position.x ?? 0
    return ax - bx
  })

  for (const edge of sortedEdges) {
    if ((outDeg[edge.source] ?? 0) === 1 && (inDeg[edge.target] ?? 0) === 1) {
      const src = nodeById[edge.source]
      const tgt = nodeById[edge.target]
      if (src && tgt) {
        const srcH = (src.data as { height?: number }).height ?? DEFAULT_NODE_HEIGHT
        const tgtH = (tgt.data as { height?: number }).height ?? DEFAULT_NODE_HEIGHT
        const srcCenterY = src.position.y + srcH / 2
        tgt.position = { ...tgt.position, y: srcCenterY - tgtH / 2 }
      }
    }
  }
}

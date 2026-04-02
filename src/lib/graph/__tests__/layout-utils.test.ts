import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { alignOneToOnePairs, attachParentIds, filterDictTables } from '../layout-utils'

// ─── filterDictTables ────────────────────────────────────────────────

describe('filterDictTables', () => {
  const dicts = [
    { database: 'analytics', name: 'regions' },
    { database: 'analytics', name: 'cities' },
  ]

  it('removes Dictionary-engine tables that have a matching dictionary', () => {
    const tables = [
      { database: 'analytics', name: 'events', engine: 'MergeTree' },
      { database: 'analytics', name: 'regions', engine: 'Dictionary' },
      { database: 'analytics', name: 'cities', engine: 'Dictionary' },
    ]
    const result = filterDictTables(tables, dicts)
    expect(result).toEqual([{ database: 'analytics', name: 'events', engine: 'MergeTree' }])
  })

  it('keeps Dictionary-engine tables without a matching dictionary', () => {
    const tables = [{ database: 'analytics', name: 'orphan_dict', engine: 'Dictionary' }]
    const result = filterDictTables(tables, dicts)
    expect(result).toEqual([{ database: 'analytics', name: 'orphan_dict', engine: 'Dictionary' }])
  })

  it('keeps non-Dictionary tables with same name as a dictionary', () => {
    const tables = [{ database: 'analytics', name: 'regions', engine: 'MergeTree' }]
    const result = filterDictTables(tables, dicts)
    expect(result).toEqual([{ database: 'analytics', name: 'regions', engine: 'MergeTree' }])
  })

  it('handles empty inputs', () => {
    expect(filterDictTables([], [])).toEqual([])
    expect(filterDictTables([], dicts)).toEqual([])
  })

  it('distinguishes by database', () => {
    const tables = [{ database: 'other_db', name: 'regions', engine: 'Dictionary' }]
    const result = filterDictTables(tables, dicts)
    expect(result).toEqual([{ database: 'other_db', name: 'regions', engine: 'Dictionary' }])
  })
})

// ─── alignOneToOnePairs ──────────────────────────────────────────────

function makeNode(id: string, x: number, y: number, height: number): Node {
  return { id, type: 'schema', position: { x, y }, data: { height } }
}

function makeEdge(source: string, target: string): Edge {
  return { id: `e-${source}-${target}`, source, target }
}

function centerY(node: Node): number {
  const h = (node.data as { height?: number }).height ?? 70
  return node.position.y + h / 2
}

function nodeAt(nodes: Node[], idx: number): Node {
  const n = nodes[idx]
  if (!n) throw new Error(`no node at index ${idx}`)
  return n
}

describe('alignOneToOnePairs', () => {
  it('aligns a simple A→B pair to same Y center', () => {
    const nodes = [makeNode('A', 0, 0, 80), makeNode('B', 200, 50, 60)]
    const edges = [makeEdge('A', 'B')]

    alignOneToOnePairs(nodes, edges)

    expect(centerY(nodeAt(nodes, 0))).toBeCloseTo(centerY(nodeAt(nodes, 1)))
  })

  it('cascades alignment through A→B→C chain', () => {
    const nodes = [makeNode('A', 0, 0, 78), makeNode('B', 200, 30, 62), makeNode('C', 400, 60, 78)]
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')]

    alignOneToOnePairs(nodes, edges)

    const cy = centerY(nodeAt(nodes, 0))
    expect(centerY(nodeAt(nodes, 1))).toBeCloseTo(cy)
    expect(centerY(nodeAt(nodes, 2))).toBeCloseTo(cy)
  })

  it('does not align when source has multiple outgoing edges', () => {
    const nodes = [makeNode('A', 0, 0, 70), makeNode('B', 200, 50, 70), makeNode('C', 200, 150, 70)]
    const edges = [makeEdge('A', 'B'), makeEdge('A', 'C')]

    const originalBY = nodeAt(nodes, 1).position.y
    const originalCY = nodeAt(nodes, 2).position.y
    alignOneToOnePairs(nodes, edges)

    expect(nodeAt(nodes, 1).position.y).toBe(originalBY)
    expect(nodeAt(nodes, 2).position.y).toBe(originalCY)
  })

  it('does not align when target has multiple incoming edges', () => {
    const nodes = [makeNode('A', 0, 0, 70), makeNode('B', 0, 100, 70), makeNode('C', 200, 50, 70)]
    const edges = [makeEdge('A', 'C'), makeEdge('B', 'C')]

    const originalCY = nodeAt(nodes, 2).position.y
    alignOneToOnePairs(nodes, edges)

    expect(nodeAt(nodes, 2).position.y).toBe(originalCY)
  })

  it('handles nodes with different heights correctly', () => {
    const nodes = [makeNode('A', 0, 0, 100), makeNode('B', 200, 0, 60)]
    const edges = [makeEdge('A', 'B')]

    alignOneToOnePairs(nodes, edges)

    // A center = 0 + 100/2 = 50, B should be at y = 50 - 60/2 = 20
    expect(nodeAt(nodes, 1).position.y).toBe(20)
    expect(centerY(nodeAt(nodes, 0))).toBeCloseTo(centerY(nodeAt(nodes, 1)))
  })

  it('does not modify source node position', () => {
    const nodes = [makeNode('A', 0, 10, 80), makeNode('B', 200, 50, 60)]
    const edges = [makeEdge('A', 'B')]

    alignOneToOnePairs(nodes, edges)

    expect(nodeAt(nodes, 0).position.y).toBe(10)
  })

  it('handles empty inputs', () => {
    const nodes: Node[] = []
    const edges: Edge[] = []
    alignOneToOnePairs(nodes, edges)
    expect(nodes).toEqual([])
  })
})

// ─── attachParentIds ─────────────────────────────────────────────────

function makeGroupNode(db: string, x: number, y: number): Node {
  return {
    id: `__db_group_${db}__`,
    type: 'database-group',
    position: { x, y },
    data: { label: db },
  }
}

function getDb(nodeId: string): string {
  if (nodeId.startsWith('dict_')) return nodeId.slice(5).split('.')[0] ?? ''
  return nodeId.split('.')[0] ?? ''
}

describe('attachParentIds', () => {
  it('sets parentId and converts positions to relative', () => {
    const groups = [makeGroupNode('analytics', 100, 200)]
    const nodes = [makeNode('analytics.events', 150, 250, 70)]

    const result = attachParentIds(nodes, groups, getDb)

    expect(result).toHaveLength(1)
    expect(result[0]?.parentId).toBe('__db_group_analytics__')
    expect(result[0]?.position).toEqual({ x: 50, y: 50 })
  })

  it('sets expandParent on children', () => {
    const groups = [makeGroupNode('analytics', 0, 0)]
    const nodes = [makeNode('analytics.events', 10, 20, 70)]

    const result = attachParentIds(nodes, groups, getDb)

    expect(result[0]?.expandParent).toBe(true)
  })

  it('handles multiple databases', () => {
    const groups = [makeGroupNode('analytics', 0, 0), makeGroupNode('logs', 500, 0)]
    const nodes = [makeNode('analytics.events', 50, 30, 70), makeNode('logs.access', 550, 30, 70)]

    const result = attachParentIds(nodes, groups, getDb)

    expect(result[0]?.parentId).toBe('__db_group_analytics__')
    expect(result[0]?.position).toEqual({ x: 50, y: 30 })
    expect(result[1]?.parentId).toBe('__db_group_logs__')
    expect(result[1]?.position).toEqual({ x: 50, y: 30 })
  })

  it('skips nodes with no matching group', () => {
    const groups = [makeGroupNode('analytics', 0, 0)]
    const nodes = [makeNode('other.table', 100, 100, 70)]

    const result = attachParentIds(nodes, groups, getDb)

    expect(result[0]?.parentId).toBeUndefined()
    expect(result[0]?.position).toEqual({ x: 100, y: 100 })
  })

  it('skips database-group and unlinked-header nodes', () => {
    const groups = [makeGroupNode('analytics', 0, 0)]
    const groupNode: Node = {
      id: '__db_group_analytics__',
      type: 'database-group',
      position: { x: 0, y: 0 },
      data: { label: 'analytics' },
    }
    const headerNode: Node = {
      id: '__unlinked_header__',
      type: 'unlinked-header',
      position: { x: 10, y: 10 },
      data: {},
    }

    const result = attachParentIds([groupNode, headerNode], groups, getDb)

    expect(result[0]?.parentId).toBeUndefined()
    expect(result[1]?.parentId).toBeUndefined()
  })

  it('returns nodes unchanged when no groups exist', () => {
    const nodes = [makeNode('analytics.events', 100, 200, 70)]

    const result = attachParentIds(nodes, [], getDb)

    expect(result).toEqual(nodes)
  })

  it('handles dict_ prefixed node ids', () => {
    const groups = [makeGroupNode('analytics', 0, 0)]
    const nodes = [makeNode('dict_analytics.regions', 50, 50, 62)]

    const result = attachParentIds(nodes, groups, getDb)

    expect(result[0]?.parentId).toBe('__db_group_analytics__')
    expect(result[0]?.position).toEqual({ x: 50, y: 50 })
  })
})

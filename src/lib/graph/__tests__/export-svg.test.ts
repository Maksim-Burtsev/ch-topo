import type { Edge, Node } from '@xyflow/react'
import { describe, expect, it } from 'vitest'
import { buildGraphSvg } from '../export-svg'

function makeNode(
  id: string,
  label: string,
  x: number,
  y: number,
  nodeType: string,
  height = 78,
): Node {
  return {
    id,
    type: 'schema',
    position: { x, y },
    data: {
      label,
      engine: nodeType === 'mv' ? 'MaterializedView' : 'MergeTree',
      nodeType,
      height,
    },
  }
}

describe('buildGraphSvg', () => {
  it('exports visible graph nodes and edges as an SVG with the active database filter', () => {
    const nodes = [
      makeNode('analytics.events', 'events', 20, 30, 'source'),
      makeNode('analytics.events_mv', 'events_mv', 260, 30, 'mv', 62),
    ]
    const edges: Edge[] = [
      {
        id: 'e-analytics.events-analytics.events_mv',
        source: 'analytics.events',
        target: 'analytics.events_mv',
        style: { stroke: '#a855f7', strokeDasharray: '6 3' },
      },
    ]

    const svg = buildGraphSvg({
      nodes,
      edges,
      databaseFilter: 'analytics',
      width: 640,
      height: 360,
    })

    expect(svg).toContain('<svg')
    expect(svg).toContain('Database filter: analytics')
    expect(svg).toContain('events')
    expect(svg).toContain('events_mv')
    expect(svg).toContain('<line')
    expect(svg).toContain('x1="200"')
    expect(svg).toContain('x2="260"')
  })

  it('escapes labels and does not include connection secrets', () => {
    const svg = buildGraphSvg({
      nodes: [makeNode('prod.secret', 'orders & <users>', 0, 0, 'target')],
      edges: [],
      databaseFilter: '',
      width: 320,
      height: 200,
      secretProbe: 'super-secret-password',
    })

    expect(svg).toContain('orders &amp; &lt;users&gt;')
    expect(svg).toContain('Database filter: all databases')
    expect(svg).not.toContain('super-secret-password')
  })
})

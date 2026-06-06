import type { Edge, Node, XYPosition } from '@xyflow/react'

const DEFAULT_NODE_WIDTH = 180
const DEFAULT_NODE_HEIGHT = 70
const HEADER_HEIGHT = 44
const PADDING = 48

interface BuildGraphSvgOptions {
  nodes: Node[]
  edges: Edge[]
  databaseFilter: string
  width?: number
  height?: number
  secretProbe?: string
}

interface ExportNode {
  id: string
  type?: string
  x: number
  y: number
  width: number
  height: number
  label: string
  engine: string
  nodeType: string
  color: string
  bgColor: string
}

const NODE_THEME: Record<string, { border: string; bg: string; dot: string }> = {
  source: { border: '#22c55e', bg: '#ecfdf5', dot: '#22c55e' },
  mv: { border: '#a855f7', bg: '#faf5ff', dot: '#a855f7' },
  target: { border: '#f87171', bg: '#fff1f2', dot: '#f87171' },
  dictionary: { border: '#fbbf24', bg: '#fffbeb', dot: '#fbbf24' },
  group: { border: '#94a3b8', bg: '#f8fafc', dot: '#94a3b8' },
  header: { border: '#cbd5e1', bg: '#ffffff', dot: '#94a3b8' },
}

const DEFAULT_NODE_THEME = { border: '#22c55e', bg: '#ecfdf5', dot: '#22c55e' }
const GROUP_NODE_THEME = { border: '#94a3b8', bg: '#f8fafc', dot: '#94a3b8' }
const HEADER_NODE_THEME = { border: '#cbd5e1', bg: '#ffffff', dot: '#94a3b8' }

function escapeXml(value: string | number | boolean | null | undefined): string {
  const text = value == null ? '' : String(value)
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function numericData(data: Record<string, unknown>, key: string, fallback: number): number {
  const value = data[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function stringData(data: Record<string, unknown>, key: string, fallback: string): string {
  const value = data[key]
  return typeof value === 'string' ? value : fallback
}

function absolutePosition(
  node: Node,
  nodeMap: Map<string, Node>,
  seen = new Set<string>(),
): XYPosition {
  if (!node.parentId || seen.has(node.id)) return node.position
  seen.add(node.id)
  const parent = nodeMap.get(node.parentId)
  if (!parent) return node.position
  const parentPosition = absolutePosition(parent, nodeMap, seen)
  return {
    x: parentPosition.x + node.position.x,
    y: parentPosition.y + node.position.y,
  }
}

function toExportNodes(nodes: Node[]): ExportNode[] {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]))

  return nodes.map((node) => {
    const data = node.data
    const position = absolutePosition(node, nodeMap)
    const nodeType = stringData(data, 'nodeType', node.type ?? 'source')
    let theme = NODE_THEME[nodeType] ?? DEFAULT_NODE_THEME
    if (node.type === 'database-group') {
      theme = GROUP_NODE_THEME
    } else if (node.type === 'unlinked-header') {
      theme = HEADER_NODE_THEME
    }

    return {
      id: node.id,
      type: node.type,
      x: position.x,
      y: position.y,
      width: numericData(data, 'width', DEFAULT_NODE_WIDTH),
      height: numericData(data, 'height', DEFAULT_NODE_HEIGHT),
      label:
        node.type === 'unlinked-header'
          ? `Unlinked tables (${numericData(data, 'count', 0)})`
          : stringData(data, 'label', node.id),
      engine: stringData(data, 'engine', ''),
      nodeType,
      color: stringData(data, 'color', theme.border),
      bgColor: stringData(data, 'bgColor', theme.bg),
    }
  })
}

function calculateBounds(nodes: ExportNode[], width?: number, height?: number) {
  if (nodes.length === 0) {
    return {
      minX: 0,
      minY: 0,
      width: width ?? 640,
      height: height ?? 360,
    }
  }

  const minX = Math.min(...nodes.map((node) => node.x)) - PADDING
  const minY = Math.min(...nodes.map((node) => node.y)) - PADDING - HEADER_HEIGHT
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + PADDING
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + PADDING

  return {
    minX,
    minY,
    width: width ?? Math.max(maxX - minX, 320),
    height: height ?? Math.max(maxY - minY, 220),
  }
}

function edgeStroke(edge: Edge): string {
  const style = edge.style as Record<string, unknown> | undefined
  const stroke = style?.stroke
  return typeof stroke === 'string' ? stroke : '#64748b'
}

function edgeDashArray(edge: Edge): string {
  const style = edge.style as Record<string, unknown> | undefined
  const dash = style?.strokeDasharray
  return typeof dash === 'string' ? ` stroke-dasharray="${escapeXml(dash)}"` : ''
}

function renderEdge(edge: Edge, nodesById: Map<string, ExportNode>): string {
  const source = nodesById.get(edge.source)
  const target = nodesById.get(edge.target)
  if (!source || !target) return ''

  const x1 = source.x + source.width
  const y1 = source.y + source.height / 2
  const x2 = target.x
  const y2 = target.y + target.height / 2

  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${escapeXml(edgeStroke(edge))}" stroke-width="2" marker-end="url(#arrow)"${edgeDashArray(edge)} />`
}

function renderNode(node: ExportNode): string {
  if (node.type === 'database-group') {
    return `<g><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="12" fill="${escapeXml(node.bgColor)}" stroke="${escapeXml(node.color)}" stroke-width="2" stroke-dasharray="8 6" /><text x="${node.x + 14}" y="${node.y + 22}" fill="${escapeXml(node.color)}" font-size="12" font-weight="700">${escapeXml(node.label)}</text></g>`
  }

  if (node.type === 'unlinked-header') {
    return `<g><line x1="${node.x}" y1="${node.y + 4}" x2="${node.x + node.width}" y2="${node.y + 4}" stroke="#cbd5e1" /><text x="${node.x}" y="${node.y + 24}" fill="#64748b" font-size="12">${escapeXml(node.label)}</text></g>`
  }

  const theme = NODE_THEME[node.nodeType] ?? DEFAULT_NODE_THEME
  const engineText = node.engine
    ? `<text x="${node.x + 18}" y="${node.y + 47}" fill="#64748b" font-size="11">${escapeXml(node.engine)}</text>`
    : ''

  return `<g><rect x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" rx="8" fill="${theme.bg}" stroke="${theme.border}" stroke-width="2" /><circle cx="${node.x + 18}" cy="${node.y + 22}" r="4" fill="${theme.dot}" /><text x="${node.x + 30}" y="${node.y + 26}" fill="#0f172a" font-size="13" font-weight="700">${escapeXml(node.label)}</text>${engineText}</g>`
}

export function buildGraphSvg(options: BuildGraphSvgOptions): string {
  const exportNodes = toExportNodes(options.nodes)
  const nodesById = new Map(exportNodes.map((node) => [node.id, node]))
  const bounds = calculateBounds(exportNodes, options.width, options.height)
  const filterLabel = options.databaseFilter || 'all databases'
  const titleY = bounds.minY + 24
  const subtitleY = titleY + 18

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}" role="img" aria-labelledby="title desc">`,
    `<title id="title">ch-topo graph export</title>`,
    `<desc id="desc">Visible schema topology exported from ch-topo.</desc>`,
    `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="#64748b" /></marker></defs>`,
    `<rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="#ffffff" />`,
    `<text x="${bounds.minX + PADDING}" y="${titleY}" fill="#0f172a" font-size="16" font-weight="700">ch-topo schema graph</text>`,
    `<text x="${bounds.minX + PADDING}" y="${subtitleY}" fill="#64748b" font-size="12">Database filter: ${escapeXml(filterLabel)}</text>`,
    `<g>${exportNodes
      .filter((node) => node.type === 'database-group')
      .map(renderNode)
      .join('')}</g>`,
    `<g>${options.edges.map((edge) => renderEdge(edge, nodesById)).join('')}</g>`,
    `<g>${exportNodes
      .filter((node) => node.type !== 'database-group')
      .map(renderNode)
      .join('')}</g>`,
    `</svg>`,
  ].join('\n')
}

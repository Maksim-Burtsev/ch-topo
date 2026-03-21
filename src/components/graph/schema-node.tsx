import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'

type NodeType = 'source' | 'mv' | 'target' | 'dictionary'

interface SchemaNodeData {
  label: string
  engine: string
  nodeType: NodeType
  rows?: string
  size?: string
  height?: number
  [key: string]: unknown
}

const nodeStyles: Record<NodeType, { border: string; bg: string; dot: string }> = {
  source: {
    border: 'border-emerald-500/50',
    bg: 'bg-emerald-500/5',
    dot: 'bg-emerald-500',
  },
  mv: {
    border: 'border-purple-500/50',
    bg: 'bg-purple-500/5',
    dot: 'bg-purple-500',
  },
  target: {
    border: 'border-red-400/50',
    bg: 'bg-red-400/5',
    dot: 'bg-red-400',
  },
  dictionary: {
    border: 'border-amber-400/50',
    bg: 'bg-amber-400/5',
    dot: 'bg-amber-400',
  },
}

export function SchemaNode({ data }: NodeProps) {
  const d = data as SchemaNodeData
  const style = nodeStyles[d.nodeType]

  return (
    <>
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground !w-2 !h-2" />
      <div
        className={cn(
          'rounded-lg border-2 px-4 py-3 min-w-[160px] shadow-lg',
          style.border,
          style.bg,
          'bg-card',
        )}
        style={d.height ? { minHeight: d.height } : undefined}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className={cn('h-2 w-2 rounded-full shrink-0', style.dot)} />
          <span className="text-xs font-semibold truncate">{d.label}</span>
        </div>
        <div className="text-[10px] text-muted-foreground">{d.engine}</div>
        {d.rows && <div className="text-[10px] text-muted-foreground mt-0.5">{d.rows} rows</div>}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground !w-2 !h-2" />
    </>
  )
}

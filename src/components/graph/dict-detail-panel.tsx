import { ChevronDown, ChevronRight, Database, Key, X } from 'lucide-react'
import { useState } from 'react'
import type { RawDictionaryRow } from '@/lib/clickhouse/types'
import { cn, formatBytes } from '@/lib/utils'

interface DictDetailPanelProps {
  dict: RawDictionaryRow
  onClose: () => void
  onNavigate: (tableId: string) => void
}

function Section({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string
  count?: number
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-t border-border">
      <button
        className="flex w-full items-center gap-1.5 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        onClick={() => {
          setOpen(!open)
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
        {count != null && (
          <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px]">{count}</span>
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

export function DictDetailPanel({ dict, onClose, onNavigate }: DictDetailPanelProps) {
  const bytes = Number(dict.bytes_allocated) || 0

  // source looks like "ClickHouse: analytics.regions_source" — only ClickHouse sources are navigable
  const isClickHouseSource = dict.source.startsWith('ClickHouse: ')
  const sourceTableId = isClickHouseSource ? dict.source.slice('ClickHouse: '.length).trim() : null
  const [sourceExpanded, setSourceExpanded] = useState(false)

  return (
    <div className="h-full border-l border-border bg-card flex flex-col overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 p-4 border-b border-border">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold overflow-x-auto whitespace-nowrap scrollbar-none">
            {dict.name}
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5">{dict.database}</p>
          <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
              Dictionary
            </span>
            {bytes > 0 && <span>{formatBytes(bytes)}</span>}
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Source */}
        {dict.source && (
          <Section title="Source" defaultOpen>
            <div
              className={cn(
                'flex items-center gap-2 w-full rounded px-2 py-1 text-xs text-left',
                sourceTableId && 'hover:bg-accent transition-colors cursor-pointer',
                !sourceTableId && !sourceExpanded && 'cursor-pointer',
              )}
              onClick={() => {
                if (sourceTableId) {
                  onNavigate(sourceTableId)
                } else {
                  setSourceExpanded(!sourceExpanded)
                }
              }}
            >
              <Database
                size={12}
                className={cn(
                  'shrink-0',
                  sourceTableId ? 'text-amber-400' : 'text-muted-foreground',
                )}
              />
              <span className={sourceExpanded || sourceTableId ? 'break-all' : 'truncate'}>
                {sourceTableId ?? dict.source}
              </span>
            </div>
          </Section>
        )}

        {/* Keys */}
        {dict.key_names.length > 0 && (
          <Section title="Keys" count={dict.key_names.length} defaultOpen>
            <div className="space-y-0.5">
              {dict.key_names.map((name, i) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent/50"
                >
                  <Key size={10} className="text-amber-400 shrink-0" />
                  <span className="truncate font-medium">{name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono shrink-0">
                    {dict.key_types[i]}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Attributes */}
        {dict.attribute_names.length > 0 && (
          <Section title="Attributes" count={dict.attribute_names.length} defaultOpen>
            <div className="space-y-0.5">
              {dict.attribute_names.map((name, i) => (
                <div
                  key={name}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent/50"
                >
                  <span className="truncate">{name}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground font-mono shrink-0">
                    {dict.attribute_types[i]}
                  </span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

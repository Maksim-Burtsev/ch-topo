import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { getEngineVariant } from '@/components/ui/engine-variant'
import { Input } from '@/components/ui/input'
import { mockTables } from '@/lib/mock/data'
import { formatBytes, formatNumber } from '@/lib/utils'
import type { TableInfo } from '@/types'

type SortField = 'name' | 'engine' | 'total_rows' | 'total_bytes' | 'compression' | 'active_parts'
type SortDir = 'asc' | 'desc'

function getCompression(t: TableInfo): number {
  if (t.total_bytes === 0) return 0
  return t.compressed_bytes / t.total_bytes
}

export function TablesPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const filtered = useMemo(() => {
    const result = mockTables.filter((t) => t.name.toLowerCase().includes(filter.toLowerCase()))

    result.sort((a, b) => {
      let cmp = 0
      switch (sortField) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'engine':
          cmp = a.engine.localeCompare(b.engine)
          break
        case 'total_rows':
          cmp = a.total_rows - b.total_rows
          break
        case 'total_bytes':
          cmp = a.total_bytes - b.total_bytes
          break
        case 'compression':
          cmp = getCompression(a) - getCompression(b)
          break
        case 'active_parts':
          cmp = a.active_parts - b.active_parts
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [filter, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown size={12} className="text-muted-foreground/50" />
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            placeholder="Filter tables..."
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
            }}
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} table{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {(
                [
                  ['name', 'Name'],
                  ['engine', 'Engine'],
                  ['total_rows', 'Rows'],
                  ['total_bytes', 'Size'],
                  ['compression', 'Compression'],
                  ['active_parts', 'Parts'],
                ] as [SortField, string][]
              ).map(([field, label]) => (
                <th
                  key={field}
                  className="h-10 px-4 text-left text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                  onClick={() => {
                    toggleSort(field)
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    <SortIcon field={field} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr
                key={t.name}
                className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => {
                  void navigate(`/tables/${t.name}`)
                }}
              >
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3">
                  <Badge variant={getEngineVariant(t.engine)}>{t.engine}</Badge>
                </td>
                <td className="px-4 py-3 tabular-nums">{formatNumber(t.total_rows)}</td>
                <td className="px-4 py-3 tabular-nums">{formatBytes(t.total_bytes)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {t.total_bytes > 0 ? `${(getCompression(t) * 100).toFixed(1)}%` : '—'}
                </td>
                <td className="px-4 py-3 tabular-nums">{t.active_parts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { getEngineVariant } from '@/components/ui/engine-variant'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import type { RawTableRow } from '@/lib/clickhouse/types'
import { formatBytes, formatNumber } from '@/lib/utils'
import { useSchemaStore } from '@/stores/schema-store'

type SortField = 'name' | 'engine' | 'total_rows' | 'total_bytes' | 'compression'
type SortDir = 'asc' | 'desc'

function numVal(s: string): number {
  return Number(s) || 0
}

function getCompression(t: RawTableRow): number {
  const total = numVal(t.total_bytes)
  if (total === 0) return 0
  return numVal(t.data_compressed_bytes) / total
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-3">
        <div className="h-4 w-32 rounded bg-muted animate-pulse" />
      </td>
      <td className="px-4 py-3">
        <div className="h-5 w-20 rounded bg-muted animate-pulse" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-16 rounded bg-muted animate-pulse" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-16 rounded bg-muted animate-pulse" />
      </td>
      <td className="px-4 py-3">
        <div className="h-4 w-12 rounded bg-muted animate-pulse" />
      </td>
    </tr>
  )
}

export function TablesPage() {
  const navigate = useNavigate()
  const tables = useSchemaStore((s) => s.tables)
  const tablesReady = useSchemaStore((s) => s.tablesReady)
  const status = useSchemaStore((s) => s.status)

  const [filter, setFilter] = useState('')
  const [databaseFilter, setDatabaseFilter] = useState('')
  const [engineFilter, setEngineFilter] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const inputRef = useRef<HTMLInputElement>(null)

  const databases = useMemo(() => {
    const set = new Set(tables.map((t) => t.database))
    return [...set].sort()
  }, [tables])

  // If only one database, use it even if user hasn't selected one
  const effectiveDatabaseFilter =
    databaseFilter === '' && databases.length === 1 ? (databases[0] ?? '') : databaseFilter

  const engines = useMemo(() => {
    const set = new Set(tables.map((t) => t.engine))
    return [...set].sort()
  }, [tables])

  const filtered = useMemo(() => {
    const result = tables.filter(
      (t) =>
        t.name.toLowerCase().includes(filter.toLowerCase()) &&
        (effectiveDatabaseFilter === '' || t.database === effectiveDatabaseFilter) &&
        (engineFilter === '' || t.engine === engineFilter),
    )

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
          cmp = numVal(a.total_rows) - numVal(b.total_rows)
          break
        case 'total_bytes':
          cmp = numVal(a.total_bytes) - numVal(b.total_bytes)
          break
        case 'compression':
          cmp = getCompression(a) - getCompression(b)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [tables, filter, effectiveDatabaseFilter, engineFilter, sortField, sortDir])

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

  // Esc to clear filter
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        setFilter('')
        setDatabaseFilter('')
        setEngineFilter('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('keydown', handleKey)
    }
  }, [])

  if (!tablesReady && status === 'loading') {
    return (
      <div>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-9 w-64 rounded-md bg-muted animate-pulse" />
          <div className="h-9 w-44 rounded-md bg-muted animate-pulse" />
        </div>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {['Name', 'Engine', 'Rows', 'Size', 'Compression'].map((h) => (
                  <th
                    key={h}
                    className="h-10 px-4 text-left text-xs font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 8 }, (_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    )
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
            ref={inputRef}
            placeholder="Filter tables... (press / to focus)"
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value)
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={effectiveDatabaseFilter}
          onChange={(e) => {
            setDatabaseFilter(e.target.value)
          }}
          className="w-44"
        >
          <option value="">All databases</option>
          {databases.map((db) => (
            <option key={db} value={db}>
              {db}
            </option>
          ))}
        </Select>
        <Select
          value={engineFilter}
          onChange={(e) => {
            setEngineFilter(e.target.value)
          }}
          className="w-44"
        >
          <option value="">All engines</option>
          {engines.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
        <span className="text-xs text-muted-foreground">
          {filtered.length} table{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {tablesReady && tables.length === 0 && (
        <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-border text-center">
          <p className="text-sm font-medium text-muted-foreground">No tables found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No tables found in this database. Check your connection settings.
          </p>
        </div>
      )}

      {tables.length > 0 && filtered.length === 0 && (filter || databaseFilter || engineFilter) && (
        <div className="flex flex-col items-center justify-center h-64 rounded-lg border border-border text-center">
          <p className="text-sm font-medium text-muted-foreground">No matching tables</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Try adjusting your filter or engine selection.
          </p>
        </div>
      )}

      {filtered.length > 0 && (
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
                  key={`${t.database}.${t.name}`}
                  className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => {
                    void navigate(`/tables/${t.database}/${t.name}`)
                  }}
                >
                  <td className="px-4 py-3">
                    <span className="font-medium">{t.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{t.database}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={getEngineVariant(t.engine)}>{t.engine}</Badge>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(numVal(t.total_rows))}</td>
                  <td className="px-4 py-3 tabular-nums">{formatBytes(numVal(t.total_bytes))}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {numVal(t.total_bytes) > 0
                      ? `${(getCompression(t) * 100).toFixed(1)}%`
                      : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { Select } from '@/components/ui/select'
import { getEffectiveDatabase } from '@/lib/database-utils'
import { useDatabaseFilterStore } from '@/stores/database-filter-store'

interface DatabaseFilterProps {
  databases: string[]
  className?: string
  onChange?: (database: string) => void
}

/**
 * Shared database filter dropdown. Persists selection across pages via zustand
 * store and reflects the value in URL search params (?db=...) for shareability.
 */
export function DatabaseFilter({ databases, className, onChange }: DatabaseFilterProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedDatabase = useDatabaseFilterStore((s) => s.selectedDatabase)
  const setSelectedDatabase = useDatabaseFilterStore((s) => s.setSelectedDatabase)
  const initialized = useRef(false)

  // On mount: sync URL -> store (URL takes precedence), or store -> URL
  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const dbFromUrl = searchParams.get('db') ?? ''
    if (dbFromUrl && databases.includes(dbFromUrl)) {
      if (dbFromUrl !== selectedDatabase) {
        setSelectedDatabase(dbFromUrl)
      }
    } else if (selectedDatabase && databases.includes(selectedDatabase)) {
      setSearchParams(
        (prev) => {
          prev.set('db', selectedDatabase)
          return prev
        },
        { replace: true },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleChange(db: string) {
    setSelectedDatabase(db)
    setSearchParams(
      (prev) => {
        if (db) {
          prev.set('db', db)
        } else {
          prev.delete('db')
        }
        return prev
      },
      { replace: true },
    )
    onChange?.(db)
  }

  const effectiveValue = getEffectiveDatabase(selectedDatabase, databases)

  return (
    <Select
      value={effectiveValue}
      onChange={(e) => {
        handleChange(e.target.value)
      }}
      className={className}
    >
      <option value="">All databases</option>
      {databases.map((db) => (
        <option key={db} value={db}>
          {db}
        </option>
      ))}
    </Select>
  )
}

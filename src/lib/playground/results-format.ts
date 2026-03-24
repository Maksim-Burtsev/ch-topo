// ── Cell formatting ───────────────────────────────────────────

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return value.toLocaleString()
  if (typeof value === 'boolean') return String(value)
  const str = typeof value === 'string' ? value : JSON.stringify(value)
  if (ISO_DATE_RE.test(str)) {
    const d = new Date(str)
    if (!isNaN(d.getTime())) {
      return d.toLocaleString()
    }
  }
  return str
}

export function isNullish(value: unknown): boolean {
  return value === null || value === undefined
}

// ── Sorting ───────────────────────────────────────────────────

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  column: string
  direction: SortDirection
}

export function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  const strA = typeof a === 'string' ? a : JSON.stringify(a)
  const strB = typeof b === 'string' ? b : JSON.stringify(b)
  return strA.localeCompare(strB)
}

export function sortRows(
  rows: Record<string, unknown>[],
  sort: SortState | null,
): Record<string, unknown>[] {
  if (!sort) return rows
  const { column, direction } = sort
  const multiplier = direction === 'asc' ? 1 : -1
  return [...rows].sort(
    (a, b) => multiplier * compareValues(a[column], b[column]),
  )
}

// ── Clipboard ─────────────────────────────────────────────────

export function copyToClipboard(value: unknown): Promise<void> {
  let text: string
  if (value === null || value === undefined) {
    text = ''
  } else if (typeof value === 'string') {
    text = value
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = `${value}`
  } else {
    text = JSON.stringify(value)
  }
  return navigator.clipboard.writeText(text)
}

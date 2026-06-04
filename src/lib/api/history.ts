import type { RawDDLHistoryRow } from '@/lib/clickhouse/types'

interface ApiErrorBody {
  error?: unknown
}

interface HistoryResponse {
  entries: RawDDLHistoryRow[]
}

async function readErrorMessage(response: Response) {
  try {
    const body = (await response.json()) as ApiErrorBody
    if (typeof body.error === 'string' && body.error.trim()) {
      return body.error
    }
  } catch {
    // Fall back to the HTTP status below.
  }

  return `HTTP ${response.status}`
}

export async function fetchServerHistory(): Promise<RawDDLHistoryRow[]> {
  const response = await fetch('/api/history', {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  const body = (await response.json()) as HistoryResponse
  return body.entries
}

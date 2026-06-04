import type { ConnectionParams } from '@/lib/clickhouse/types'

interface ApiErrorBody {
  error?: unknown
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

export async function connectServerMode(params: ConnectionParams): Promise<void> {
  const response = await fetch('/api/connect', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }
}

export async function disconnectServerMode(): Promise<void> {
  const response = await fetch('/api/disconnect', {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }
}

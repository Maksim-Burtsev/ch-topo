import type {
  RawColumnRow,
  RawDictionaryRow,
  RawGrantRow,
  RawIndexRow,
  RawRowPolicyRow,
  RawTableRow,
} from '@/lib/clickhouse/types'
import type { SchemaWarning } from '@/stores/schema-store'

interface ApiErrorBody {
  error?: unknown
}

export interface ServerSchemaPayload {
  tables: RawTableRow[]
  columns: RawColumnRow[]
  indices: RawIndexRow[]
  dictionaries: RawDictionaryRow[]
  rowPolicies: RawRowPolicyRow[]
  grants: RawGrantRow[]
  warnings: SchemaWarning[]
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

export async function fetchServerSchema(): Promise<ServerSchemaPayload> {
  const response = await fetch('/api/schema', {
    method: 'GET',
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return (await response.json()) as ServerSchemaPayload
}

export type ExplainMode = 'plan' | 'pipeline' | 'syntax'

export interface ExplainRequestPayload {
  sql: string
  mode?: ExplainMode
  timeoutMs?: number
}

export interface ExplainResult {
  mode: ExplainMode
  text: string
}

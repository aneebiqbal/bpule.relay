/** Execution-health snapshot for a rep on a given day. */
export interface ExecutionHealthData {
  executionHealth: number
  state: string
  warnings: Array<{ level: string; message: string }>
  completions: Array<{ action: string; actual: number; target: number; rawRatio: number }>
  slaScore: number
  primaryNextAction: string | null
}

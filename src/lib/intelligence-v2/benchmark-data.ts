import benchmarkSnapshot from '@/lib/intelligence-v2/benchmark-snapshot.json'
export { formatBenchmarkTimestamp } from '@/lib/intelligence-v2/benchmark-format'

export type BenchmarkState = 'pass' | 'warn' | 'fail'

export interface BenchmarkMetric {
  id: string
  label: string
  value: string
  note?: string
}

export interface BenchmarkCategoryResult {
  id: string
  label: string
  passed: number
  total: number
  notes: string
}

export interface BenchmarkTimelineEvent {
  id: string
  label: string
  detail: string
  state: 'complete' | 'issue' | 'resolved'
}

export interface BenchmarkEvidenceRow {
  key: string
  value: string
}

export interface IntelligenceBenchmarkSnapshot {
  status: {
    label: string
    state: BenchmarkState
    detail: string
  }
  lastVerifiedAt: string
  artifact: {
    datasetVersion: string
    path: string
  }
  metrics: {
    landing: BenchmarkMetric[]
    app: BenchmarkMetric[]
  }
  evidence: BenchmarkEvidenceRow[]
  categoryResults: BenchmarkCategoryResult[]
  timelineEvents: BenchmarkTimelineEvent[]
  copy: {
    landing: {
      kicker: string
      title: string
      description: string
      trustLine: string
      disclaimer: string
      finalCta: string
    }
    app: {
      header: string
      description: string
      statusBanner: string
      timelineTitle: string
      evidenceTitle: string
      categoriesTitle: string
      whatThisMeansTitle: string
      whatThisMeans: string[]
      warmExplanation: string
      qualityGateNote: string
      finalCta: string
    }
  }
}

export const INTELLIGENCE_BENCHMARK_SNAPSHOT = benchmarkSnapshot as IntelligenceBenchmarkSnapshot

export async function getIntelligenceBenchmarkSnapshot(): Promise<IntelligenceBenchmarkSnapshot | null> {
  return INTELLIGENCE_BENCHMARK_SNAPSHOT
}

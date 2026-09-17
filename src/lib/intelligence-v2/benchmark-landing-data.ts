import benchmarkLandingSnapshot from '@/lib/intelligence-v2/benchmark-landing-snapshot.json'

export interface BenchmarkLandingMetric {
  id: string
  label: string
  value: string
  note: string
}

export interface IntelligenceBenchmarkLandingSnapshot {
  lastVerifiedAt: string
  metrics: BenchmarkLandingMetric[]
  copy: {
    kicker: string
    title: string
    description: string
    trustLine: string
    disclaimer: string
    finalCta: string
  }
}

export const INTELLIGENCE_BENCHMARK_LANDING_SNAPSHOT =
  benchmarkLandingSnapshot as IntelligenceBenchmarkLandingSnapshot

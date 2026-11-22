/**
 * The one score contract.
 *
 * Three different questions were previously both labelled "Job Match", which made
 * a 74/100 discovery score and a 49/100 document score look like a contradiction.
 * They are not: they measure different things and are now named accordingly.
 *
 *   Candidate Fit            — how well the actual person/profile satisfies the
 *                              posting. Produced by the discovery matcher.
 *   Resume Quality           — how complete, readable, truthful and extractable
 *                              the tailored CV is. Produced by the ATS assessor.
 *   Resume-to-Job Coverage   — how well the generated resume communicates the
 *                              requirements the verified experience supports.
 *                              Also produced by the ATS assessor.
 *
 * `internalReadiness` is a composite heuristic. It is never presented as an
 * employer score.
 */
export type ScoreMetricKey = 'candidate_fit' | 'resume_quality' | 'resume_to_job_coverage' | 'internal_readiness'

export interface ScoreMetric {
  key: ScoreMetricKey
  label: string
  shortLabel: string
  version: number
  question: string
}

export const SCORE_METRICS: Record<ScoreMetricKey, ScoreMetric> = {
  candidate_fit: {
    key: 'candidate_fit',
    label: 'Candidate Fit',
    shortLabel: 'Candidate fit',
    version: 3,
    question: 'How well does the actual person satisfy the posting requirements?',
  },
  resume_quality: {
    key: 'resume_quality',
    label: 'Resume Quality',
    shortLabel: 'Resume quality',
    version: 1,
    question: 'How complete, readable, truthful and extractable is the tailored CV?',
  },
  resume_to_job_coverage: {
    key: 'resume_to_job_coverage',
    label: 'Resume-to-Job Coverage',
    shortLabel: 'Coverage',
    version: 1,
    question: 'How well does the generated resume communicate the requirements the verified experience supports?',
  },
  internal_readiness: {
    key: 'internal_readiness',
    label: 'Internal Readiness',
    shortLabel: 'Readiness',
    version: 1,
    question: 'Internal composite heuristic — never an employer ATS ranking.',
  },
}

/** True when a persisted score was produced by a current scoring method. */
export function isCurrentScore(key: ScoreMetricKey, version: number | null | undefined): boolean {
  if (version == null) return false
  return version >= SCORE_METRICS[key].version
}

/**
 * A score as persisted on a package or match row: the value, the metric and the
 * method version, so an old score can be invalidated or clearly labelled.
 */
export interface VersionedScore {
  metric: ScoreMetricKey
  score: number
  version: number
  label: string
}

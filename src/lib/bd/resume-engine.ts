/**
 * Resume Generation Engine — truthful tailoring only.
 * Reorganizes and emphasizes existing facts. NEVER fabricates.
 */

export interface ResumeData {
  name: string
  title: string
  summary: string
  skills: string[]
  experience: ResumeExperience[]
  projects: ResumeProject[]
  education: string[]
  certifications: string[]
}

export interface ResumeExperience {
  company: string
  role: string
  period: string
  bullets: string[]
}

export interface ResumeProject {
  name: string
  description: string
  technologies: string[]
  outcome: string | null
}

export interface ResumeTarget {
  title: string | null
  company: string | null
  requiredSkills: string[]
  responsibilities: string[]
  technologies: string[]
}

export interface ResumeScoreResult {
  score: number
  dimensions: { label: string; score: number; max: number; note: string }[]
  missing: string[]
}

export function generateResume(base: ResumeData, target: ResumeTarget): ResumeData {
  const reorderedSkills = [
    ...base.skills.filter((s) => target.requiredSkills.some((ts) => ts.toLowerCase() === s.toLowerCase())),
    ...base.skills.filter((s) => !target.requiredSkills.some((ts) => ts.toLowerCase() === s.toLowerCase())),
  ]

  const reorderedExperience = base.experience.map((exp) => ({
    ...exp,
    bullets: [
      ...exp.bullets.filter((b) => target.technologies.some((t) => b.toLowerCase().includes(t.toLowerCase()))),
      ...exp.bullets.filter((b) => !target.technologies.some((t) => b.toLowerCase().includes(t.toLowerCase()))),
    ],
  }))

  const reorderedProjects = [...base.projects].sort((a, b) => {
    const aOverlap = a.technologies.filter((t) => target.technologies.some((tt) => tt.toLowerCase() === t.toLowerCase())).length
    const bOverlap = b.technologies.filter((t) => target.technologies.some((tt) => tt.toLowerCase() === t.toLowerCase())).length
    return bOverlap - aOverlap
  })

  return {
    ...base,
    summary: tailorSummary(base.summary, target),
    skills: reorderedSkills,
    experience: reorderedExperience,
    projects: reorderedProjects,
  }
}

function tailorSummary(baseSummary: string, target: ResumeTarget): string {
  if (!baseSummary) return ''
  const mentionsTarget = target.technologies.some((t) => baseSummary.toLowerCase().includes(t.toLowerCase()))
  if (mentionsTarget) return baseSummary
  const targetTech = target.technologies.slice(0, 3).join(', ')
  if (targetTech) return `${baseSummary} Seeking to apply this experience with ${targetTech}.`
  return baseSummary
}

export function scoreResume(resume: ResumeData, target: ResumeTarget): ResumeScoreResult {
  const dimensions: ResumeScoreResult['dimensions'] = []
  const missing: string[] = []

  // Skill coverage (max 25)
  const skillCoverage = target.requiredSkills.length > 0
    ? resume.skills.filter((s) => target.requiredSkills.some((ts) => ts.toLowerCase() === s.toLowerCase())).length / target.requiredSkills.length
    : 1
  const skillScore = Math.round(skillCoverage * 25)
  dimensions.push({ label: 'Required skill coverage', score: skillScore, max: 25, note: `${Math.round(skillCoverage * 100)}% of required skills present` })

  // Responsibility alignment (max 20)
  const allBullets = resume.experience.flatMap((e) => e.bullets).join(' ').toLowerCase()
  const respMatch = target.responsibilities.filter((r) =>
    r.toLowerCase().split(/\s+/).some((word) => word.length > 3 && allBullets.includes(word)),
  ).length
  const respCoverage = target.responsibilities.length > 0 ? respMatch / target.responsibilities.length : 0.5
  dimensions.push({ label: 'Responsibility alignment', score: Math.round(respCoverage * 20), max: 20, note: `${respMatch}/${target.responsibilities.length} responsibilities addressed` })

  // Domain relevance (max 15)
  const targetText = `${target.title || ''} ${target.company || ''}`.toLowerCase()
  const resumeText = resume.experience.map((e) => `${e.company} ${e.role}`).join(' ').toLowerCase()
  const domains = ['fintech', 'healthcare', 'ecommerce', 'saas', 'web3', 'ai', 'education', 'logistics']
  const targetDomains = domains.filter((d) => targetText.includes(d))
  const resumeDomains = domains.filter((d) => resumeText.includes(d))
  const domainOverlap = targetDomains.filter((d) => resumeDomains.includes(d)).length
  const domainScore = targetDomains.length > 0 ? Math.round((domainOverlap / targetDomains.length) * 15) : 8
  dimensions.push({ label: 'Domain relevance', score: domainScore, max: 15, note: domainOverlap > 0 ? `Domain match: ${targetDomains.filter((d) => resumeDomains.includes(d)).join(', ')}` : 'No specific domain match' })

  // Project relevance (max 20)
  const projectTech = resume.projects.flatMap((p) => p.technologies).map((t) => t.toLowerCase())
  const projMatch = target.technologies.filter((t) => projectTech.includes(t.toLowerCase())).length
  const projCoverage = target.technologies.length > 0 ? projMatch / target.technologies.length : 0.5
  dimensions.push({ label: 'Project relevance', score: Math.round(projCoverage * 20), max: 20, note: `${projMatch}/${target.technologies.length} tech matches in projects` })

  // Clarity (max 10)
  dimensions.push({ label: 'Clarity & structure', score: resume.experience.length > 0 && resume.skills.length > 0 ? 10 : 5, max: 10, note: resume.experience.length > 0 && resume.skills.length > 0 ? 'Complete structure' : 'Partial structure' })

  // Evidence (max 10)
  const evidenceScore = resume.experience.filter((e) => e.bullets.length > 0).length > 0 ? 10 : 5
  dimensions.push({ label: 'Evidence strength', score: evidenceScore, max: 10, note: evidenceScore === 10 ? 'Bullet points present' : 'Limited evidence' })

  for (const skill of target.requiredSkills) {
    if (!resume.skills.some((s) => s.toLowerCase() === skill.toLowerCase())) missing.push(skill)
  }

  const totalScore = dimensions.reduce((s, d) => s + d.score, 0)
  return { score: totalScore, dimensions, missing }
}

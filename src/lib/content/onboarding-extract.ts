import type {
  ContentProfile,
  ContentProfileExpertise,
  ContentProfileOpinion,
  ContentProfileProject,
  ContentProfileExperience,
} from '@/lib/domain/types'

/**
 * Onboarding extraction — parse imported source material into structured identity.
 *
 * Deterministic-first parsing. No model calls for standard formats.
 * Produces suggestions for user confirmation.
 */

export interface ExtractedIdentity {
  role: string
  seniority: string
  company: string
  industries: string[]
  expertise: ContentProfileExpertise[]
  opinions: ContentProfileOpinion[]
  projects: ContentProfileProject[]
  experiences: ContentProfileExperience[]
  technologies: string[]
  audiences: string[]
  territories: string[]
  contentGoals: string[]
  rawText: string
}

export function extractIdentityFromSource(text: string): ExtractedIdentity {
  const lower = text.toLowerCase()
  const now = new Date().toISOString()

  const identity: ExtractedIdentity = {
    role: extractRole(text),
    seniority: extractSeniority(text),
    company: extractCompany(text),
    industries: extractIndustries(text),
    expertise: [],
    opinions: [],
    projects: [],
    experiences: [],
    technologies: extractTechnologies(text),
    audiences: [],
    territories: [],
    contentGoals: [],
    rawText: text.slice(0, 200),
  }

  // Build expertise from detected technologies + role
  identity.expertise = buildExpertise(identity.technologies, identity.role, text)

  // Extract projects
  identity.projects = extractProjects(text)

  // Extract experiences/lessons
  identity.experiences = extractExperiences(text)

  // Suggest audiences based on role + expertise
  identity.audiences = suggestAudiences(identity.role, identity.expertise, text)

  // Suggest territories
  identity.territories = suggestTerritories(identity.role, identity.expertise, identity.industries)

  // Extract opinions
  identity.opinions = extractOpinions(text)

  // Suggest goals
  identity.contentGoals = suggestGoals(identity.role, text)

  return identity
}

function extractRole(text: string): string {
  const rolePatterns: [RegExp, string][] = [
    [/\b(chief technology officer|cto)\b/i, 'Chief Technology Officer'],
    [/\b(vice president|vp) (of )?engineering\b/i, 'VP Engineering'],
    [/\b(head of engineering|engineering director|director of engineering)\b/i, 'Engineering Director'],
    [/\b(staff engineer|principal engineer|distinguished engineer)\b/i, 'Staff Engineer'],
    [/\b(senior staff engineer)\b/i, 'Senior Staff Engineer'],
    [/\b(software architect|technical architect|solution architect)\b/i, 'Software Architect'],
    [/\b(senior|lead|principal) (full[- ]stack|frontend|backend|software) (engineer|developer)\b/i, 'Senior Software Engineer'],
    [/\b(full[- ]stack|frontend|backend|software) (engineer|developer)\b/i, 'Software Engineer'],
    [/\b(founder|co[- ]?founder)\b/i, 'Founder'],
    [/\b(ceo|chief executive)\b/i, 'CEO'],
    [/\b(product manager|senior product manager)\b/i, 'Product Manager'],
    [/\b(designer|ux designer|ui designer|product designer)\b/i, 'Product Designer'],
    [/\b(consultant|senior consultant)\b/i, 'Consultant'],
    [/\b(marketing|growth|demand gen)\b/i, 'Marketing Professional'],
    [/\b(sales|business development|bd|account executive)\b/i, 'Sales Professional'],
  ]

  for (const [pattern, role] of rolePatterns) {
    if (pattern.test(text)) return role
  }
  return 'Professional'
}

function extractSeniority(text: string): string {
  if (/\b(chief|ceo|cto|cfo|coo|founder|president)\b/i.test(text)) return 'Executive'
  if (/\b(vp|vice president|head of|director)\b/i.test(text)) return 'Director'
  if (/\b(staff|principal|distinguished|senior|lead)\b/i.test(text)) return 'Senior'
  if (/\b(mid|intermediate)\b/i.test(text)) return 'Mid-level'
  if (/\b(junior|entry|associate|intern)\b/i.test(text)) return 'Junior'
  return 'Mid-level'
}

function extractCompany(text: string): string {
  const patterns = [
    /(?:at|@)\s+([A-Z][A-Za-z0-9&' .]{1,60}?)(?:\s*[,.]|\s+(?:since|from|and|&)|$)/m,
    /([A-Z][A-Za-z0-9&' .]{2,40})\s*[—|-]\s*(?:Founder|CEO|CTO|Engineer|Designer)/,
    /\b(?:founder|ceo|cto)\s+(?:at|of|@)\s+([A-Z][A-Za-z0-9&' .]{1,60})/i,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return ''
}

function extractIndustries(text: string): string[] {
  const industries: string[] = []
  const patterns: [RegExp, string][] = [
    [/\b(saas|software as a service)\b/i, 'SaaS'],
    [/\b(fintech|financial technology|banking payments)\b/i, 'FinTech'],
    [/\b(healthcare|health tech|medtech)\b/i, 'Healthcare'],
    [/\b(e[- ]commerce|ecommerce|retail tech)\b/i, 'eCommerce'],
    [/\b(web3|crypto|blockchain|defi|nft)\b/i, 'Web3'],
    [/\b(ai|artificial intelligence|machine learning|llm|deep learning)\b/i, 'AI/ML'],
    [/\b(edtech|education technology)\b/i, 'EdTech'],
    [/\b(logistics|supply chain)\b/i, 'Logistics'],
    [/\b(cybersecurity|security|infosec)\b/i, 'Cybersecurity'],
    [/\b(real estate|proptech)\b/i, 'PropTech'],
    [/\b(mobile|ios|android)\b/i, 'Mobile'],
    [/\b(marketplace|platform)\b/i, 'Marketplace'],
    [/\b(devops|infrastructure|cloud|sre)\b/i, 'DevOps/Infrastructure'],
    [/\b(data|analytics|data engineering|data science)\b/i, 'Data'],
    [/\b(gaming|game development)\b/i, 'Gaming'],
    [/\b(agency|consulting|services)\b/i, 'Consulting'],
  ]
  for (const [pattern, industry] of patterns) {
    if (pattern.test(text) && !industries.includes(industry)) {
      industries.push(industry)
    }
  }
  return industries
}

function extractTechnologies(text: string): string[] {
  const techs: string[] = []
  const patterns: [RegExp, string][] = [
    [/\b(react|react\.js|reactjs)\b/i, 'React'],
    [/\b(next\.?js|nextjs)\b/i, 'Next.js'],
    [/\b(node\.?js|nodejs|node)\b/i, 'Node.js'],
    [/\b(typescript|ts)\b/i, 'TypeScript'],
    [/\b(javascript|js)\b/i, 'JavaScript'],
    [/\b(ruby on rails|rails)\b/i, 'Rails'],
    [/\b(python|django|flask|fastapi)\b/i, 'Python'],
    [/\b(go|golang)\b/i, 'Go'],
    [/\b(rust)\b/i, 'Rust'],
    [/\b(java|spring|spring boot)\b/i, 'Java'],
    [/\b(kotlin|android)\b/i, 'Kotlin'],
    [/\b(swift|ios)\b/i, 'Swift'],
    [/\b(postgres|postgresql)\b/i, 'PostgreSQL'],
    [/\b(mongo(db)?)\b/i, 'MongoDB'],
    [/\b(redis)\b/i, 'Redis'],
    [/\b(aws|amazon web services)\b/i, 'AWS'],
    [/\b(gcp|google cloud)\b/i, 'GCP'],
    [/\b(azure)\b/i, 'Azure'],
    [/\b(docker|kubernetes|k8s)\b/i, 'Kubernetes'],
    [/\b(terraform|iac)\b/i, 'Terraform'],
    [/\b(graphql)\b/i, 'GraphQL'],
    [/\b(api|rest|microservice)\b/i, 'APIs'],
    [/\b(git|github|ci[-/]?cd)\b/i, 'Git/CI-CD'],
    [/\b(sql|database|db)\b/i, 'SQL'],
    [/\b(html|css|tailwind)\b/i, 'Frontend'],
    [/\b(figma|sketch|design system)\b/i, 'Design Tools'],
    [/\b(elasticsearch|search)\b/i, 'Search'],
    [/\b(rabbit[k]?mq|kafka|message queue)\b/i, 'Messaging'],
    [/\b(vercel|netlify|heroku)\b/i, 'Deployment'],
  ]
  for (const [pattern, tech] of patterns) {
    if (pattern.test(text) && !techs.includes(tech)) {
      techs.push(tech)
    }
  }
  return techs
}

function buildExpertise(technologies: string[], role: string, text: string): ContentProfileExpertise[] {
  const now = new Date().toISOString()
  const expertise: ContentProfileExpertise[] = []

  for (const tech of technologies.slice(0, 6)) {
    const level = text.toLowerCase().includes(`senior ${tech.toLowerCase()}`) || text.toLowerCase().includes(`expert ${tech.toLowerCase()}`)
      ? 'expert' as const
      : text.toLowerCase().includes(`lead ${tech.toLowerCase()}`)
        ? 'advanced' as const
        : 'advanced' as const
    expertise.push({
      area: tech,
      level,
      evidence: `Detected in profile`,
      updatedAt: now,
    })
  }

  // Add role-based expertise
  if (role.includes('Architect') || role.includes('Staff')) {
    expertise.push({ area: 'System Architecture', level: 'expert', evidence: 'Inferred from role', updatedAt: now })
  }
  if (role.includes('Founder') || role.includes('CEO')) {
    expertise.push({ area: 'Company Building', level: 'advanced', evidence: 'Inferred from role', updatedAt: now })
  }
  if (role.includes('Director') || role.includes('VP')) {
    expertise.push({ area: 'Engineering Leadership', level: 'expert', evidence: 'Inferred from role', updatedAt: now })
  }

  return expertise
}

function extractProjects(text: string): ContentProfileProject[] {
  const projects: ContentProfileProject[] = []
  const now = new Date().toISOString()

  // Look for project descriptions
  const projectPatterns = [
    /(?:built|created|developed|designed|launched|shipped|led)\s+(?:a |an |the )?(.{10,80}?)(?:\.|,|\n|$)/gi,
    /(?:project|product|platform|system|app|tool)[:\s]+(.{10,80}?)(?:\.|,|\n|$)/gi,
  ]

  for (const pattern of projectPatterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const name = match[1].trim()
      if (name.length > 10 && name.length < 80 && !projects.some((p) => p.name === name)) {
        projects.push({
          name,
          description: '',
          role: '',
          outcome: '',
          lessons: [],
          updatedAt: now,
        })
      }
    }
  }

  return projects.slice(0, 4)
}

function extractExperiences(text: string): ContentProfileExperience[] {
  const experiences: ContentProfileExperience[] = []
  const now = new Date().toISOString()

  const patterns: [RegExp, ContentProfileExperience['type'], string][] = [
    [/\b(learned|lesson|realized|discovered)\s+(?:that )?(.{15,100}?)(?:\.|,|\n|$)/gi, 'lesson', ''],
    [/\b(mistake|failed|wrong|regret)\s+(.{10,80}?)(?:\.|,|\n|$)/gi, 'mistake', ''],
    [/\b(achievement|accomplished|shipped|delivered|launched)\s+(.{10,80}?)(?:\.|,|\n|$)/gi, 'success', ''],
    [/\b(decided|decision|chose)\s+(?:to )?(.{10,80}?)(?:\.|,|\n|$)/gi, 'decision', ''],
  ]

  for (const [pattern, type, _] of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const description = match[2]?.trim() || match[1]?.trim() || ''
      if (description.length > 15) {
        experiences.push({
          type,
          description: description.slice(0, 120),
          lesson: type === 'lesson' || type === 'mistake' ? description.slice(0, 120) : '',
          date: null,
          updatedAt: now,
        })
      }
    }
  }

  return experiences.slice(0, 4)
}

function extractOpinions(text: string): ContentProfileOpinion[] {
  const opinions: ContentProfileOpinion[] = []
  const now = new Date().toISOString()

  const patterns = [
    [/\b(I think|I believe|in my view|I feel)\s+(.{15,120}?)(?:\.|,|\n|$)/gi, 'moderate'] as const,
    [/\b(always|never|everyone|nobody|should|must)\s+(.{10,80}?)(?:\.|,|\n|$)/gi, 'strong'] as const,
  ]

  for (const [pattern, strength] of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      const belief = match[2]?.trim() || match[1]?.trim() || ''
      if (belief.length > 15 && belief.length < 120) {
        opinions.push({
          belief: belief.slice(0, 100),
          strength,
          evidence: '',
          source: 'inference',
          updatedAt: now,
        })
      }
    }
  }

  return opinions.slice(0, 4)
}

function suggestAudiences(role: string, expertise: ContentProfileExpertise[], _text: string): string[] {
  const audiences: string[] = []

  if (role.includes('Engineer') || role.includes('Architect')) {
    audiences.push('Software Engineers', 'Engineering Leaders')
  }
  if (role.includes('Founder') || role.includes('CEO')) {
    audiences.push('Startup Founders', 'CTOs', 'Investors')
  }
  if (role.includes('Manager') || role.includes('Director') || role.includes('VP')) {
    audiences.push('Engineering Leaders', 'CTOs', 'VPs of Engineering')
  }
  if (role.includes('Designer')) {
    audiences.push('Product Designers', 'UX Leads', 'Product Teams')
  }
  if (role.includes('Marketing')) {
    audiences.push('Marketing Leaders', 'Growth Teams', 'Founders')
  }
  if (role.includes('Sales') || role.includes('BD')) {
    audiences.push('Founders', 'Sales Leaders', 'BD Teams')
  }
  if (role.includes('Consultant')) {
    audiences.push('Clients', 'Business Leaders', 'Technical Decision Makers')
  }

  // Add expertise-based audiences
  const expertAreas = expertise.filter((e) => e.level === 'expert').map((e) => e.area)
  if (someMatch(expertAreas, ['React', 'Next.js', 'JavaScript', 'TypeScript'])) {
    audiences.push('Frontend Developers', 'React Developers')
  }
  if (someMatch(expertAreas, ['Rails', 'Ruby'])) {
    audiences.push('Rails Teams', 'Ruby Developers')
  }
  if (someMatch(expertAreas, ['AWS', 'GCP', 'Azure', 'Kubernetes'])) {
    audiences.push('DevOps Engineers', 'Platform Engineers')
  }
  if (someMatch(expertAreas, ['AI/ML', 'Python'])) {
    audiences.push('AI Engineers', 'Data Scientists')
  }

  return [...new Set(audiences)].slice(0, 8)
}

function suggestTerritories(role: string, expertise: ContentProfileExpertise[], industries: string[]): string[] {
  const territories: string[] = []

  // Role-based
  if (role.includes('Engineer')) {
    territories.push('Technical Deep Dives', 'Engineering Lessons', 'Code Reviews', 'Technical Decisions')
  }
  if (role.includes('Architect')) {
    territories.push('System Architecture', 'Technical Strategy', 'Architecture Decisions')
  }
  if (role.includes('Founder') || role.includes('CEO')) {
    territories.push('Company Building', 'Leadership Lessons', 'Founder Journey', 'Product Strategy')
  }
  if (role.includes('Manager') || role.includes('Director') || role.includes('VP')) {
    territories.push('Engineering Leadership', 'Team Building', 'Hiring', 'Engineering Culture')
  }

  // Expertise-based
  const expertAreas = expertise.filter((e) => e.level === 'expert' || e.level === 'advanced').map((e) => e.area)
  for (const area of expertAreas.slice(0, 4)) {
    territories.push(`${area} Insights`)
  }

  // Industry-based
  for (const industry of industries.slice(0, 3)) {
    territories.push(`${industry} Developments`)
  }

  return [...new Set(territories)].slice(0, 12)
}

function suggestGoals(role: string, text: string): string[] {
  const goals: string[] = []
  const lower = text.toLowerCase()

  if (role.includes('Founder') || role.includes('CEO') || lower.includes('client') || lower.includes('business')) {
    goals.push('get_clients', 'grow_my_company')
  }
  if (role.includes('Engineer') || role.includes('Architect')) {
    goals.push('build_authority', 'grow_my_network')
  }
  if (lower.includes('hire') || lower.includes('job') || lower.includes('career') || lower.includes('opportunity')) {
    goals.push('get_job_opportunities')
  }
  if (lower.includes('share') || lower.includes('teach') || lower.includes('learn') || lower.includes('help')) {
    goals.push('share_what_i_learn')
  }
  if (lower.includes('brand') || lower.includes('personal') || lower.includes('thought leader')) {
    goals.push('build_a_personal_brand')
  }
  if (goals.length === 0) {
    goals.push('build_authority', 'grow_my_network')
  }

  return [...new Set(goals)]
}

function someMatch(arr: string[], targets: string[]): boolean {
  return arr.some((a) => targets.some((t) => a.toLowerCase().includes(t.toLowerCase())))
}

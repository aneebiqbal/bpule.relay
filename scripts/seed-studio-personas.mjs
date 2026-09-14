#!/usr/bin/env node
/**
 * Seeds 6 realistic Studio personas for development/product QA testing.
 *
 * DEVELOPMENT ONLY. Never run against production.
 *
 * Creates for each persona:
 * - Content DNA (role, seniority, expertise, technologies, opinions, projects, experiences)
 * - Topic clusters
 * - Content memories (previous posts)
 * - Content history with metrics
 * - Accepted/rejected feedback signals
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... NEXT_PUBLIC_SUPABASE_URL=... node scripts/seed-studio-personas.mjs
 *
 * Wipes existing personas first (dev only).
 */

import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceRole) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_ID = '11111111-1111-1111-1111-111111111111'

// ── Persona definitions ────────────────────────────────────────────────────────

const PERSONAS = [
  {
    displayName: 'Sarah Chen',
    role: 'Senior Full-Stack Engineer',
    seniority: 'Senior',
    platforms: ['linkedin', 'x'],
    humorStyle: 'Dry, understated',
    industries: ['fintech', 'developer tools'],
    audience: 'senior engineers and engineering managers navigating system design decisions',
    expertise: [
      { area: 'distributed systems', level: 'expert', evidence: 'built payment processing at scale', updatedAt: '2024-11-01' },
      { area: 'Rails architecture', level: 'expert', evidence: '10 years production Rails', updatedAt: '2024-11-01' },
      { area: 'PostgreSQL performance', level: 'advanced', evidence: 'query optimization for high-throughput systems', updatedAt: '2024-11-01' },
      { area: 'React/Next.js', level: 'proficient', evidence: 'migrated legacy ERB to Next.js', updatedAt: '2024-11-01' },
    ],
    technologies: [
      { name: 'Ruby on Rails', proficiency: 'expert', context: 'primary backend framework' },
      { name: 'React', proficiency: 'proficient', context: 'frontend SPAs' },
      { name: 'PostgreSQL', proficiency: 'expert', context: 'primary database' },
      { name: 'Redis', proficiency: 'proficient', context: 'caching and job queues' },
      { name: 'Next.js', proficiency: 'using', context: 'marketing pages and dashboards' },
      { name: 'TypeScript', proficiency: 'proficient', context: 'new frontend work' },
    ],
    opinions: [
      { belief: 'Monoliths are underrated for teams under 20 engineers', strength: 'strong', evidence: 'saw microservices add more pain than value at small scale', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Rails is not dead — it is optimized for developer happiness over benchmark supremacy', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Most performance problems are N+1 queries, not language speed', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
    ],
    projects: [
      { name: 'Payment Gateway v2', description: 'Rebuilt payment processing with idempotency guarantees', role: 'Tech Lead', outcome: 'Reduced failed payments by 40%', lessons: ['Always design for retry safety', 'Database constraints catch what tests miss'], updatedAt: '2024-11-01' },
      { name: 'Rails-to-Next.js Migration', description: 'Migrated customer dashboard from ERB to Next.js', role: 'Lead Engineer', outcome: 'Page load dropped from 3.2s to 400ms', lessons: ['Incremental migration beats big rewrite', 'Start with the highest-traffic pages'], updatedAt: '2024-11-01' },
    ],
    experiences: [
      { type: 'mistake', description: 'Deployed a background job that double-charged 200 customers because it was not idempotent', lesson: 'Always make jobs idempotent before running in production', date: '2024-09-15', updatedAt: '2024-11-01' },
      { type: 'decision', description: 'Chose to stay on Postgres instead of adding Elasticsearch for search', lesson: 'Good enough search beats perfect search with operational overhead', date: '2024-08-01', updatedAt: '2024-11-01' },
    ],
    writingCharacteristics: { sentenceRhythm: 'measured, varied length', preferredLength: 'medium', questionFrequency: 'occasional', dataUsage: 'light' },
    topicClusters: ['System Design', 'Rails Architecture', 'PostgreSQL Performance', 'Frontend Migration'],
    memories: [
      { type: 'topic_covered', content: 'Why we chose to stay on Postgres instead of adding Elasticsearch' },
      { type: 'topic_covered', content: 'Making background jobs idempotent the hard way' },
      { type: 'hook_used', content: 'We double-charged 200 customers on a Tuesday morning' },
      { type: 'angle_used', content: 'production failure as a lesson in idempotency' },
    ],
    history: [
      { line: 'We double-charged 200 customers on a Tuesday morning. The background job was not idempotent. Here is the fix and what I would do differently.', likes: 234, reach: 8900, comments: 47, saves: 89, reposts: 34 },
      { line: 'We chose Postgres full-text search over Elasticsearch. Two years later, still the right call.', likes: 156, reach: 6200, comments: 28, saves: 67 },
    ],
    feedback: [
      { reaction: 'posting', topicClusterId: 'System Design' },
      { reaction: 'posting', topicClusterId: 'Rails Architecture' },
    ],
    recentInputs: [
      'I spent yesterday debugging a query that was doing 4,000 index scans per request. The fix was a composite index we should have added a year ago.',
      'We had to roll back a deploy because a migration locked the users table for 90 seconds. The fix was using pg_repack for online schema changes.',
    ],
  },
  {
    displayName: 'Marcus Rivera',
    role: 'DevOps Engineer',
    seniority: 'Senior',
    platforms: ['linkedin', 'x'],
    humorStyle: 'Direct, occasionally sarcastic',
    industries: ['infrastructure', 'SaaS'],
    audience: 'platform engineers and teams managing cloud infrastructure',
    expertise: [
      { area: 'Kubernetes orchestration', level: 'expert', evidence: 'manages 200+ node cluster', updatedAt: '2024-11-01' },
      { area: 'AWS infrastructure', level: 'expert', evidence: 'multi-region, multi-account setup', updatedAt: '2024-11-01' },
      { area: 'CI/CD pipeline design', level: 'expert', evidence: 'reduced build times by 60%', updatedAt: '2024-11-01' },
      { area: 'observability', level: 'advanced', evidence: 'Datadog + custom metrics', updatedAt: '2024-11-01' },
    ],
    technologies: [
      { name: 'Kubernetes', proficiency: 'expert', context: 'container orchestration' },
      { name: 'AWS', proficiency: 'expert', context: 'cloud infrastructure' },
      { name: 'Terraform', proficiency: 'expert', context: 'infrastructure as code' },
      { name: 'Docker', proficiency: 'expert', context: 'container builds' },
      { name: 'GitHub Actions', proficiency: 'proficient', context: 'CI/CD pipelines' },
      { name: 'Datadog', proficiency: 'proficient', context: 'monitoring and alerting' },
    ],
    opinions: [
      { belief: 'Most Kubernetes complexity is self-inflicted by over-engineering', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Build times are a retention issue — slow CI drives engineers away', strength: 'strong', evidence: 'tracked attrition vs build time correlation', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'You do not need a service mesh until you have 50+ services', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
    ],
    projects: [
      { name: 'CI Pipeline Overhaul', description: 'Reduced build times from 18 minutes to 4 minutes using caching and parallelization', role: 'Lead', outcome: 'Deploy frequency tripled', lessons: ['Cache aggressively', 'Fail fast on lint before running full suite'], updatedAt: '2024-11-01' },
      { name: 'Multi-Region Failover', description: 'Built automated failover across us-east and us-west', role: 'Tech Lead', outcome: 'Survived us-east outage with zero downtime', lessons: ['Test failover monthly', 'DNS TTLs matter more than you think'], updatedAt: '2024-11-01' },
    ],
    experiences: [
      { type: 'mistake', description: 'Deleted a Terraform state file that managed $200K/month of infrastructure', lesson: 'State files are more valuable than code — lock them and back them up', date: '2024-07-20', updatedAt: '2024-11-01' },
      { type: 'success', description: 'Survived a regional AWS outage with zero customer impact due to multi-region setup', lesson: 'Redundancy is expensive until it is not', date: '2024-10-01', updatedAt: '2024-11-01' },
    ],
    writingCharacteristics: { sentenceRhythm: 'short, punchy', preferredLength: 'short', questionFrequency: 'rare', dataUsage: 'heavy' },
    topicClusters: ['CI/CD', 'Kubernetes', 'Cloud Infrastructure', 'Observability'],
    memories: [
      { type: 'topic_covered', content: 'How we cut CI build times from 18 minutes to 4 minutes' },
      { type: 'topic_covered', content: 'Why Terraform state files are production infrastructure' },
      { type: 'hook_used', content: 'I deleted the Terraform state file that managed $200K/month of infrastructure' },
    ],
    history: [
      { line: 'Our CI pipeline went from 18 minutes to 4. Deploy frequency tripled. The fix was aggressive caching and killing sequential builds.', likes: 412, reach: 15200, comments: 89, saves: 234, reposts: 156 },
      { line: 'I deleted a Terraform state file on a Friday. Here is how we recovered and what we changed.', likes: 567, reach: 22100, comments: 134, saves: 345, reposts: 89 },
    ],
    feedback: [
      { reaction: 'posting', topicClusterId: 'CI/CD' },
      { reaction: 'posting', topicClusterId: 'Cloud Infrastructure' },
    ],
    recentInputs: [
      'A Kubernetes node ran out of memory and took down three unrelated services because we had no resource limits set. The fix was limit ranges and pod priority classes.',
      'We had a deploy fail because a Docker image layer cache was stale. The image had a CVE from three months ago.',
    ],
  },
  {
    displayName: 'Priya Sharma',
    role: 'ML Engineer',
    seniority: 'Mid-Level',
    platforms: ['linkedin', 'x'],
    humorStyle: 'Curious, precise, occasionally playful',
    industries: ['AI/ML', 'search', 'developer tools'],
    audience: 'engineers building with LLMs and teams evaluating AI products',
    expertise: [
      { area: 'LLM evaluation', level: 'expert', evidence: 'built internal eval framework', updatedAt: '2024-11-01' },
      { area: 'RAG systems', level: 'advanced', evidence: 'production RAG pipeline serving 10k queries/day', updatedAt: '2024-11-01' },
      { area: 'model fine-tuning', level: 'intermediate', evidence: 'fine-tuned Llama for internal use case', updatedAt: '2024-11-01' },
      { area: 'inference optimization', level: 'advanced', evidence: 'vLLM + quantization for cost reduction', updatedAt: '2024-11-01' },
    ],
    technologies: [
      { name: 'Python', proficiency: 'expert', context: 'ML development' },
      { name: 'PyTorch', proficiency: 'proficient', context: 'model training' },
      { name: 'vLLM', proficiency: 'proficient', context: 'inference serving' },
      { name: 'LangChain', proficiency: 'using', context: 'prototyping' },
      { name: 'Pinecone', proficiency: 'proficient', context: 'vector search' },
      { name: 'OpenAI API', proficiency: 'proficient', context: 'production calls' },
    ],
    opinions: [
      { belief: 'Most LLM failures are context window problems, not model capability problems', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Eval-driven development is the only way to ship reliable AI features', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Fine-tuning is rarely the answer — prompt engineering and RAG come first', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
    ],
    projects: [
      { name: 'Internal RAG Pipeline', description: 'Built retrieval-augmented generation system for internal documentation', role: 'ML Engineer', outcome: 'Reduced support tickets by 35%', lessons: ['Chunking strategy matters more than embedding model quality', 'Always measure hallucination rate'], updatedAt: '2024-11-01' },
      { name: 'LLM Evaluation Framework', description: 'Created systematic evaluation for model outputs across 12 dimensions', role: 'Sole Builder', outcome: 'Caught regression before production', lessons: ['Automated evals catch what manual review misses', 'LLM-as-judge needs human calibration'], updatedAt: '2024-11-01' },
    ],
    experiences: [
      { type: 'mistake', description: 'Shipped a RAG feature that hallucinated pricing information because retrieval pulled from outdated docs', lesson: 'Stale data in the knowledge base is worse than no data — add freshness checks', date: '2024-09-01', updatedAt: '2024-11-01' },
      { type: 'lesson', description: 'Discovered that eval scores improved but user satisfaction dropped', lesson: 'Optimize for user outcomes, not eval metrics', date: '2024-10-15', updatedAt: '2024-11-01' },
    ],
    writingCharacteristics: { sentenceRhythm: 'measured, explanatory', preferredLength: 'medium', questionFrequency: 'occasional', dataUsage: 'heavy' },
    topicClusters: ['LLM Evaluation', 'RAG Systems', 'AI Infrastructure', 'Prompt Engineering'],
    memories: [
      { type: 'topic_covered', content: 'Why LLM evaluation frameworks need human calibration' },
      { type: 'topic_covered', content: 'How our RAG pipeline hallucinated pricing data' },
      { type: 'hook_used', content: 'Our RAG bot confidently quoted pricing from 2022' },
    ],
    history: [
      { line: 'Our internal RAG bot started quoting pricing from 2022. The retrieval was working. The data was stale. Here is the freshness check we added.', likes: 289, reach: 11400, comments: 67, saves: 178, reposts: 98 },
      { line: 'We built an LLM evaluation framework with 12 dimensions. It caught a model regression before it hit production.', likes: 198, reach: 8700, comments: 45, saves: 134 },
    ],
    feedback: [
      { reaction: 'posting', topicClusterId: 'LLM Evaluation' },
      { reaction: 'posting', topicClusterId: 'RAG Systems' },
    ],
    recentInputs: [
      'We switched from cosine similarity to hybrid retrieval (BM25 + vector) and our hallucination rate dropped by half. The embeddings alone were missing exact keyword matches.',
      'I found that our eval framework was gaming itself — the LLM judge favored longer responses regardless of quality. Adding length-normalized scoring fixed it.',
    ],
  },
  {
    displayName: 'Jake Morrison',
    role: 'Forward Deployed Engineer',
    seniority: 'Mid-Level',
    platforms: ['linkedin'],
    humorStyle: 'Conversational, practical, warm',
    industries: ['AI/ML', 'customer success', 'integrations'],
    audience: 'technical founders and engineers implementing AI in production',
    expertise: [
      { area: 'AI workflow implementation', level: 'expert', evidence: 'deployed 30+ AI agents in customer environments', updatedAt: '2024-11-01' },
      { area: 'customer integration', level: 'expert', evidence: 'deep experience with enterprise APIs', updatedAt: '2024-11-01' },
      { area: 'agent architecture', level: 'advanced', evidence: 'built multi-agent orchestration', updatedAt: '2024-11-01' },
      { area: 'production debugging', level: 'advanced', evidence: 'debugged AI systems in customer prod', updatedAt: '2024-11-01' },
    ],
    technologies: [
      { name: 'Python', proficiency: 'expert', context: 'agent development' },
      { name: 'OpenAI/Anthropic APIs', proficiency: 'expert', context: 'LLM integration' },
      { name: 'LangGraph', proficiency: 'proficient', context: 'agent orchestration' },
      { name: 'PostgreSQL', proficiency: 'proficient', context: 'data layer' },
      { name: 'FastAPI', proficiency: 'proficient', context: 'API development' },
      { name: 'Docker', proficiency: 'using', context: 'deployment' },
    ],
    opinions: [
      { belief: 'Customers do not want AI — they want their problem solved. AI is just the means.', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'The biggest failure mode in AI deployments is overpromising what the model can do', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Every AI agent needs a graceful fallback to human review', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
    ],
    projects: [
      { name: 'Customer Onboarding Agent', description: 'Built AI agent that automates enterprise customer onboarding workflows', role: 'Lead Engineer', outcome: 'Reduced onboarding from 3 weeks to 3 days', lessons: ['Start with the happy path, add edge cases later', 'Customers trust agents more when they know when to escalate'], updatedAt: '2024-11-01' },
      { name: 'Multi-Agent Support System', description: 'Deployed coordinated agents for tier-1 support triage', role: 'FDE', outcome: 'Handled 60% of tier-1 tickets without human', lessons: ['Agent handoffs need clear ownership', 'Log every decision for debugging'], updatedAt: '2024-11-01' },
    ],
    experiences: [
      { type: 'mistake', description: 'Deployed an AI agent that confidently gave wrong compliance advice to a healthcare customer', lesson: 'Domain-specific AI needs domain-specific guardrails, not just general safety', date: '2024-08-15', updatedAt: '2024-11-01' },
      { type: 'lesson', description: 'Found that customers trusted the agent less when it was too confident', lesson: 'Calibrated uncertainty builds more trust than false confidence', date: '2024-10-01', updatedAt: '2024-11-01' },
    ],
    writingCharacteristics: { sentenceRhythm: 'conversational, varied', preferredLength: 'medium', questionFrequency: 'frequent', dataUsage: 'light' },
    topicClusters: ['AI Agents', 'Customer Implementation', 'Production AI', 'Agent Reliability'],
    memories: [
      { type: 'topic_covered', content: 'Why every AI agent needs a graceful fallback to human review' },
      { type: 'topic_covered', content: 'What happens when an AI agent gives wrong compliance advice' },
      { type: 'hook_used', content: 'A customer asked our AI agent about HIPAA compliance. It answered confidently. It was wrong.' },
    ],
    history: [
      { line: 'A customer asked our AI agent about HIPAA compliance. It answered confidently. It was wrong. Here is what we changed about guardrails.', likes: 345, reach: 14300, comments: 89, saves: 234, reposts: 167 },
      { line: 'We reduced customer onboarding from 3 weeks to 3 days with an AI agent. The secret was not the model — it was the escalation path.', likes: 267, reach: 10800, comments: 56, saves: 189 },
    ],
    feedback: [
      { reaction: 'posting', topicClusterId: 'AI Agents' },
      { reaction: 'posting', topicClusterId: 'Customer Implementation' },
    ],
    recentInputs: [
      'A customer asked our agent to process PII in a way that violated their own data policy. The agent did it because the prompt allowed it. We added policy-aware guardrails.',
      'We found that customers trust the agent more when it says "I am not sure about this one" instead of guessing. Calibrated uncertainty is a feature.',
    ],
  },
  {
    displayName: 'Aisha Patel',
    role: 'Frontend Engineer',
    seniority: 'Senior',
    platforms: ['x', 'linkedin'],
    humorStyle: 'Warm, precise, occasionally witty',
    industries: ['e-commerce', 'design systems', 'accessibility'],
    audience: 'frontend engineers and design systems teams',
    expertise: [
      { area: 'React performance', level: 'expert', evidence: 'reduced bundle size by 60%', updatedAt: '2024-11-01' },
      { area: 'design systems', level: 'expert', evidence: 'built component library used by 12 teams', updatedAt: '2024-11-01' },
      { area: 'web accessibility', level: 'advanced', evidence: 'WCAG 2.1 AA compliance', updatedAt: '2024-11-01' },
      { area: 'TypeScript', level: 'expert', evidence: 'strict TS across monorepo', updatedAt: '2024-11-01' },
    ],
    technologies: [
      { name: 'React', proficiency: 'expert', context: 'primary framework' },
      { name: 'TypeScript', proficiency: 'expert', context: 'type-safe development' },
      { name: 'Next.js', proficiency: 'proficient', context: 'SSR and SSG' },
      { name: 'Tailwind CSS', proficiency: 'proficient', context: 'styling' },
      { name: 'Storybook', proficiency: 'proficient', context: 'component documentation' },
      { name: 'Playwright', proficiency: 'using', context: 'E2E testing' },
    ],
    opinions: [
      { belief: 'Most accessibility issues are not hard — they are just not prioritized', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Design systems fail when they are built by a separate team from the product', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Bundle size is a feature — every KB you ship is a user you lose on slow connections', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
    ],
    projects: [
      { name: 'Component Library v3', description: 'Rebuilt design system with accessibility-first approach', role: 'Tech Lead', outcome: 'Adoption went from 4 to 12 teams', lessons: ['Document the why, not just the how', 'Accessibility is not a feature flag'], updatedAt: '2024-11-01' },
      { name: 'Performance Overhaul', description: 'Reduced Largest Contentful Paint from 4.2s to 1.1s', role: 'Lead', outcome: 'Conversion rate increased 12%', lessons: ['Measure real user metrics, not lab scores', 'Code splitting is not optional at scale'], updatedAt: '2024-11-01' },
    ],
    experiences: [
      { type: 'mistake', description: 'Shipped a component library update that broke screen reader support for 2,000 users', lesson: 'Accessibility regression tests are not optional — add them to CI', date: '2024-09-01', updatedAt: '2024-11-01' },
      { type: 'success', description: 'Reduced bundle size by 60% by removing unused dependencies and code splitting', lesson: 'The best performance optimization is not shipping code', date: '2024-10-01', updatedAt: '2024-11-01' },
    ],
    writingCharacteristics: { sentenceRhythm: 'warm, flowing', preferredLength: 'medium', questionFrequency: 'occasional', dataUsage: 'light' },
    topicClusters: ['Design Systems', 'Web Performance', 'Accessibility', 'React Patterns'],
    memories: [
      { type: 'topic_covered', content: 'How we reduced Largest Contentful Paint from 4.2 seconds to 1.1 seconds' },
      { type: 'topic_covered', content: 'Why accessibility regression tests belong in CI' },
      { type: 'hook_used', content: 'Our component library update broke screen reader support for 2,000 users' },
    ],
    history: [
      { line: 'Our component library update broke screen reader support for 2,000 users. Here is the automated a11y test we added to CI so it never happens again.', likes: 189, reach: 7800, comments: 34, saves: 145, reposts: 78 },
      { line: 'We cut our bundle size by 60%. The secret was not tree-shaking — it was deleting 40% of our dependencies.', likes: 234, reach: 9200, comments: 56, saves: 198 },
    ],
    feedback: [
      { reaction: 'posting', topicClusterId: 'Design Systems' },
      { reaction: 'posting', topicClusterId: 'Web Performance' },
    ],
    recentInputs: [
      'I found that our modal component was re-rendering 40 times on open because of a context provider that was not memoized. The fix was splitting the context.',
      'We had a customer complain that our checkout flow was unusable with a screen reader. The issue was a missing aria-live region on the error message.',
    ],
  },
  {
    displayName: 'David Park',
    role: 'Engineering Manager',
    seniority: 'Staff',
    platforms: ['linkedin'],
    humorStyle: 'Thoughtful, measured, direct',
    industries: ['fintech', 'engineering leadership'],
    audience: 'senior engineers considering management and new engineering managers',
    expertise: [
      { area: 'engineering team leadership', level: 'expert', evidence: 'managed teams of 8-25 engineers', updatedAt: '2024-11-01' },
      { area: 'architecture decision-making', level: 'advanced', evidence: 'led architecture reviews for 3 years', updatedAt: '2024-11-01' },
      { area: 'hiring and team building', level: 'expert', evidence: 'hired 40+ engineers', updatedAt: '2024-11-01' },
      { area: 'delivery and planning', level: 'advanced', evidence: 'shipped quarterly planning process', updatedAt: '2024-11-01' },
    ],
    technologies: [
      { name: 'System Design', proficiency: 'proficient', context: 'architecture reviews' },
      { name: 'PostgreSQL', proficiency: 'using', context: 'data-informed decisions' },
      { name: 'Python', proficiency: 'learning', context: 'understanding team work' },
      { name: 'React', proficiency: 'learning', context: 'understanding team work' },
    ],
    opinions: [
      { belief: 'The best engineering managers are translators between business and technical contexts', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Hiring slowly is the highest-leverage thing a manager can do', strength: 'strong', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
      { belief: 'Most technical debt is actually prioritization debt — we chose to ship instead of fix', strength: 'moderate', evidence: '', source: 'onboarding', updatedAt: '2024-11-01' },
    ],
    projects: [
      { name: 'Team Restructure', description: 'Split a 25-person team into three focused squads with clear ownership', role: 'Engineering Manager', outcome: 'Deployment frequency doubled, on-call burden halved', lessons: ['Smaller teams with clear ownership outperform large teams', 'Restructure around business domains, not technical layers'], updatedAt: '2024-11-01' },
      { name: 'Hiring Process Redesign', description: 'Rebuilt interview loop to reduce bias and improve candidate experience', role: 'Hiring Manager', outcome: 'Offer acceptance rate went from 60% to 85%', lessons: ['Structured interviews reduce bias more than training', 'Candidate experience is a signal of team health'], updatedAt: '2024-11-01' },
    ],
    experiences: [
      { type: 'mistake', description: 'Promoted the strongest IC to manager and lost a great engineer while gaining a struggling manager', lesson: 'Management is a different career path, not a promotion', date: '2024-06-01', updatedAt: '2024-11-01' },
      { type: 'decision', description: 'Chose to delay a feature by two weeks to pay down critical tech debt', lesson: 'Short-term delays compound into long-term speed', date: '2024-09-01', updatedAt: '2024-11-01' },
    ],
    writingCharacteristics: { sentenceRhythm: 'measured, authoritative', preferredLength: 'longer', questionFrequency: 'rare', dataUsage: 'light' },
    topicClusters: ['Engineering Leadership', 'Hiring', 'Architecture Decisions', 'Team Structure'],
    memories: [
      { type: 'topic_covered', content: 'Why promoting your best IC to manager can backfire' },
      { type: 'topic_covered', content: 'How we restructured a 25-person team into three squads' },
      { type: 'hook_used', content: 'I promoted my strongest engineer to manager. Six months later, I had lost a great IC and gained a struggling manager.' },
    ],
    history: [
      { line: 'I promoted my strongest engineer to manager. Six months later, I had lost a great IC and gained a struggling manager. Management is a different career path, not a promotion.', likes: 892, reach: 34500, comments: 234, saves: 567, reposts: 345 },
      { line: 'We split our 25-person team into three squads. Deployment frequency doubled. On-call burden halved. The key was ownership, not headcount.', likes: 567, reach: 23400, comments: 156, saves: 432, reposts: 234 },
    ],
    feedback: [
      { reaction: 'posting', topicClusterId: 'Engineering Leadership' },
      { reaction: 'posting', topicClusterId: 'Hiring' },
    ],
    recentInputs: [
      'We had to make a call between shipping the Q3 feature on time or delaying to fix a critical security vulnerability. We delayed. The customer understood when we explained why.',
      'I have been thinking about the difference between a team that is busy and a team that is effective. Busy teams have full backlogs. Effective teams have clear priorities.',
    ],
  },
]

// ── Seed logic ────────────────────────────────────────────────────────────────

async function wipeExisting() {
  console.log('Wiping existing personas (dev only)...')
  const { error } = await supabase
    .from('content_personas')
    .delete()
    .eq('organization_id', ORG_ID)
  if (error) throw error
  console.log('Wiped.')
}

async function seedPersona(persona, repId) {
  console.log(`\nSeeding: ${persona.displayName} (${persona.role})`)

  // Create persona first (so profile can reference it)
  const { data: personaRow, error: personaError } = await supabase
    .from('content_personas')
    .insert({
      rep_id: repId,
      organization_id: ORG_ID,
      display_name: persona.displayName,
      platforms: persona.platforms,
      humor_style: persona.humorStyle,
      values_and_opinions: persona.opinions.map((o) => o.belief),
      admired_examples: [],
      content_profile_id: null,
    })
    .select()
    .single()
  if (personaError) throw personaError

  // Create content profile with persona_id
  const { data: profile, error: profileError } = await supabase
    .from('content_profiles')
    .insert({
      organization_id: ORG_ID,
      persona_id: personaRow.id,
      role: persona.role,
      seniority: persona.seniority,
      industries: persona.industries,
      audience: persona.audience,
      expertise: JSON.stringify(persona.expertise),
      technologies: JSON.stringify(persona.technologies),
      goals: JSON.stringify([]),
      topics_cared: JSON.stringify(persona.opinions.map((o) => ({ topic: o.belief.slice(0, 50), intensity: 'passionate', source: 'onboarding' }))),
      topics_avoided: JSON.stringify([]),
      opinions: JSON.stringify(persona.opinions),
      projects: JSON.stringify(persona.projects),
      experiences: JSON.stringify(persona.experiences),
      writing_characteristics: JSON.stringify(persona.writingCharacteristics),
      storytelling_tendencies: JSON.stringify([]),
      confidence: 0.6,
    })
    .select()
    .single()
  if (profileError) throw profileError

  // Link profile back to persona
  const { error: linkError } = await supabase
    .from('content_personas')
    .update({ content_profile_id: profile.id })
    .eq('id', personaRow.id)
  if (linkError) throw linkError

  // Create topic clusters
  for (const clusterName of persona.topicClusters) {
    const { error } = await supabase
      .from('topic_clusters')
      .insert({
        organization_id: ORG_ID,
        persona_id: personaRow.id,
        cluster_name: clusterName,
        description: `${clusterName} topics for ${persona.displayName}`,
        source_type: 'profile',
        last_input_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
      })
    if (error) throw error
  }

  // Create content memories
  for (const mem of persona.memories) {
    const { error } = await supabase
      .from('content_memories')
      .insert({
        organization_id: ORG_ID,
        persona_id: personaRow.id,
        memory_type: mem.type,
        content: mem.content,
      })
    if (error) throw error
  }

  // Create content history with metrics
  for (const h of persona.history) {
    const { error } = await supabase
      .from('content_history')
      .insert({
        organization_id: ORG_ID,
        persona_id: personaRow.id,
        platform: persona.platforms[0],
        opening_line: h.line,
        posted_at: new Date(Date.now() - Math.random() * 60 * 86400000).toISOString(),
        likes: h.likes,
        reach: h.reach,
        comments: h.comments,
        reposts: h.reposts,
        saves: h.saves,
        metrics_logged_at: new Date().toISOString(),
      })
    if (error) throw error
  }

  // Create feedback signals
  for (const fb of persona.feedback) {
    const { data: draft, error: draftError } = await supabase
      .from('content_drafts')
      .insert({
        organization_id: ORG_ID,
        persona_id: personaRow.id,
        source_kind: 'answer',
        source_material: 'Seeded feedback draft',
        platform: persona.platforms[0],
        caption: 'Seeded draft for feedback',
        status: 'posted',
      })
      .select()
      .single()
    if (draftError) throw draftError

    const { error: fbError } = await supabase
      .from('content_draft_feedback')
      .insert({
        organization_id: ORG_ID,
        persona_id: personaRow.id,
        draft_id: draft.id,
        topic_cluster_id: null,
        source_kind: 'answer',
        reaction: fb.reaction,
        edited: false,
        edit_signals: [],
      })
    if (fbError) throw fbError
  }

  console.log(`  Done: ${persona.displayName} (persona: ${personaRow.id}, profile: ${profile.id})`)
  return personaRow.id
}

async function main() {
  console.log('=== Studio Persona Seeder (DEV ONLY) ===\n')

  // Find a rep to own the personas
  const { data: reps, error: repsError } = await supabase
    .from('reps')
    .select('id, name')
    .eq('organization_id', ORG_ID)
    .limit(1)
  if (repsError) throw repsError
  if (!reps || reps.length === 0) {
    console.error('No reps found in org. Run seed-dev-users.mjs first.')
    process.exit(1)
  }
  const repId = reps[0].id
  console.log(`Using rep: ${reps[0].name} (${repId})`)

  await wipeExisting()

  for (const persona of PERSONAS) {
    await seedPersona(persona, repId)
  }

  console.log(`\n=== Seeded ${PERSONAS.length} personas ===`)
  console.log('\nRecent-work inputs for testing:')
  for (const persona of PERSONAS) {
    console.log(`\n${persona.displayName} (${persona.role}):`)
    for (const input of persona.recentInputs) {
      console.log(`  - "${input.slice(0, 80)}..."`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

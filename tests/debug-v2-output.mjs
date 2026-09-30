import { config } from 'dotenv'
import { resolve } from 'node:path'
config({ path: resolve(process.cwd(), '.env.local') })

import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'

const ABDULHAKIM_TEXT = [
  'Abdulhakim Ali',
  'Founder at AgentAce | Co-founder at Tayo360 | NexaCareTech',
  '',
  'About',
  'I run AgentAce, a software development agency that helps companies build MVPs.',
  '',
  'Co-founder, Tayo360 (2023 - Present)',
  '- Building a healthcare data platform',
  '- Raised pre-seed round',
  '',
  'Posts (3 months ago)',
  'Tayo360 is hiring a senior full-stack developer. Send your resume and GitHub to careers@healthbridge.io.',
  '',
  'linkedin.com/in/abdulhakim',
].join('\n')

const result = await produceCanonicalIntelligence(ABDULHAKIM_TEXT, {})
const intel = result.intelligence.intelligence

console.log('=== V2 EXTRACTION OUTPUT ===')
console.log('Person:', intel.person.fullName)
console.log('Company:', intel.company.name)
console.log('Affiliations:', JSON.stringify(intel.person.affiliations, null, 2))
console.log('')
console.log('Opportunity:', JSON.stringify({
  signals: intel.opportunity.signals,
  orgName: intel.opportunity.organizationName,
  description: intel.opportunity.description?.slice(0, 100),
}, null, 2))
console.log('')
console.log('Posts:')
for (const p of intel.content.recentPosts) {
  console.log('  -', p.paraphrase.slice(0, 80))
  console.log('    signals:', p.signals)
}
console.log('')
console.log('=== EVIDENCE LEDGER ===')
for (const ev of result.intelligence.evidenceLedger) {
  console.log('  signal:', ev.signal.slice(0, 60))
  console.log('    ownership:', ev.ownership, '| needOwner:', ev.needOwnership)
  console.log('    orgName:', ev.organizationName, '| subjectOrg:', ev.subjectOrganizationName)
  console.log('')
}

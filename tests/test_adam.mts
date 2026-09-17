import { config } from 'dotenv'
config({ path: '/Users/mac/Desktop/products/scout/.env.local' })

import { produceCanonicalIntelligence } from '@/lib/intelligence-v2/orchestrator'

const rawText = `Adam Benjamin
CEO of Starke Marketing.
Pasadena, California, United States

About
I'm the CEO and co-founder of Starke Marketing. In the past five years, Starke has raised tens of millions of dollars in revenue for businesses ranging from start-ups to Fortune 5000 companies.
I started in marketing in 2006 in the entertainment business. I worked with various musicians, record labels and brands to grow exposure and increase profitability. 

Seeing the shift in advertising from traditional methods to digital, I began consulting for business and organizations in a variety of industries and raised millions of dollars in revenue across verticals through campaigns that were at that point, cutting edge. Today, we aim to constantly be at the forefront of the marketing world, blending tried and true tactics with tomorrow's technology.

Services
Brand Marketing, Email Marketing, Content Marketing, Search Engine Marketing (SEM), Advertising, Content Strategy, Digital Marketing

Activity
9,699 followers

Posts about: Buyer Density, AI products, marketing game, short-form video, business growth, creative-first strategy, paid media`

const result = await produceCanonicalIntelligence(rawText, {})
const i = result.intelligence

console.log('=== ADAM BENJAMIN — STARKE MARKETING ===')
console.log('Score:', i.canonicalScore + '/100', i.scoreBreakdown.label)
console.log('Qualification:', i.qualification)
console.log('Company:', i.intelligence.company.name)
console.log('Person:', i.intelligence.person.fullName, '|', i.intelligence.person.title)
console.log('Remote:', i.remoteEligibility.eligibility, '|', i.remoteEligibility.reason)
console.log('')
console.log('--- REASONS ---')
i.scoreBreakdown.reasons.forEach(r => console.log(' +', r))
console.log('')
console.log('--- WATCH OUT ---')
i.scoreBreakdown.watchOut.forEach(w => console.log(' ?', w))
console.log('')
console.log('--- DIMENSIONS ---')
i.scoreBreakdown.dimensions.forEach(d => console.log(`  ${d.label}: ${d.points}/${d.max} — ${d.note}`))
console.log('')
console.log('--- OPPORTUNITY ---')
console.log('Signals:', i.intelligence.opportunity.signals.join(', '))
console.log('Probable need:', i.intelligence.probableNeed)
console.log('Trigger:', i.intelligence.opportunityTrigger)
console.log('Timing:', i.intelligence.timingSignal)
console.log('')
console.log('--- PERSONALIZATION ---')
console.log('Angle:', i.personalizationAngle)
console.log('Proof:', i.outreachContext?.bestProof)
console.log('Anchor:', i.outreachContext?.personalizationAnchor)
console.log('')
console.log('--- MISSING ---')
i.scoreBreakdown.missingInfo.forEach(m => console.log(' ?', m))
console.log('')
console.log('--- URLS ---')
console.log('Source URLs found:', i.extractionCompleteness.sourceUrlsFound.length)
console.log('URLs preserved:', i.extractionCompleteness.urlsPreserved.length)
console.log('Profile URL:', i.rawSource.profileUrl)
console.log('LinkedIn URL:', i.intelligence.person.linkedinUrl)
console.log('')
console.log('--- EXTRACTION ---')
console.log('Present fields:', i.extractionCompleteness.presentFields.join(', '))
console.log('Missing fields:', i.extractionCompleteness.missingFields.join(', '))
console.log('Weak fields:', i.extractionCompleteness.weakFields.map(w => w.field).join(', '))

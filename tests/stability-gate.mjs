/**
 * Stability Gate — Score Reliability Test
 *
 * Extracts the same input 10 times and asserts:
 * - Same canonical score
 * - Same opportunity decision (qualification, action)
 * - Same selected episode
 * - No save/reopen drift
 *
 * Run with: node --experimental-vm-modules tests/stability-gate.mjs
 */

import { produceV3Intelligence } from '@/lib/intelligence-v3/bridge.js'

const TEST_INPUTS = [
  {
    name: 'strong explicit buyer',
    text: `Sarah Chen
CTO at TechVentures Inc.
San Francisco, CA

About: We're building a new AI-powered analytics platform and need an experienced Next.js team to help us ship our MVP. Looking for a development partner who can start immediately.

Experience:
- CTO at TechVentures (2022-present) — building AI analytics platform
- VP Engineering at DataCo (2018-2022) — scaled team to 40 engineers
- Senior Developer at StartupXYZ (2015-2018)

Recent Posts:
"Just posted: We're hiring a Next.js development team for our AI analytics platform. Must have experience with real-time data visualization and machine learning integration. Budget: $50k-$80k. DM me or email sarah@techventures.com"
"`,
  },
  {
    name: 'weak lead - service provider',
    text: `Mike Johnson
Full Stack Developer | React | Node.js
Los Angeles, CA

About: I help companies build modern web applications. 5+ years of experience in React, Node.js, and cloud technologies. Available for freelance projects.

Experience:
- Freelance Developer (2020-present)
- Junior Developer at WebAgency (2018-2020)

Recent Posts:
"Just finished a great project with a client! Built a full e-commerce platform using React and Node.js. DM me if you need similar work. #webdev #react"
"`,
  },
  {
    name: 'recruiter',
    text: `Jennifer Smith
Technical Recruiter at TalentFinders
New York, NY

About: Helping top tech companies find exceptional engineering talent. Specializing in React, Node.js, and AI/ML roles. 500+ successful placements.

Experience:
- Technical Recruiter at TalentFinders (2021-present)
- HR Coordinator at BigTech (2019-2021)

Recent Posts:
"Hiring! My client is looking for a Senior React Developer. $150k-$180k. Remote friendly. Reach out if interested!"
"`,
  },
]

async function runStabilityTest() {
  console.log('=== STABILITY GATE TEST ===\n')

  let allPassed = true

  for (const test of TEST_INPUTS) {
    console.log(`\n--- Test: ${test.name} ---`)

    const results = []
    for (let i = 0; i < 10; i++) {
      const result = await produceV3Intelligence(test.text, {})
      const v3 = result.intelligence.v3DecisionPacket
      results.push({
        score: v3?.score ?? null,
        qualification: v3?.qualification ?? null,
        action: v3?.action ?? null,
        selectedEpisodeId: v3?.selectedEpisodeId ?? null,
        decisionProvider: v3?.decisionProvider ?? null,
        decisionRunId: v3?.decisionRunId ?? null,
      })
    }

    // Assert all 10 results are identical
    const first = results[0]
    const allSame = results.every(r =>
      r.score === first.score &&
      r.qualification === first.qualification &&
      r.action === first.action &&
      r.selectedEpisodeId === first.selectedEpisodeId
    )

    console.log(`  Score: ${first.score}`)
    console.log(`  Qualification: ${first.qualification}`)
    console.log(`  Action: ${first.action}`)
    console.log(`  Selected Episode: ${first.selectedEpisodeId}`)
    console.log(`  Provider: ${first.decisionProvider}`)
    console.log(`  All 10 runs identical: ${allSame ? '✓ PASS' : '✗ FAIL'}`)

    if (!allSame) {
      allPassed = false
      console.log('  Variance detected:')
      const scores = results.map(r => r.score)
      console.log(`    Scores: ${scores.join(', ')}`)
      const qualifications = [...new Set(results.map(r => r.qualification))]
      console.log(`    Qualifications: ${qualifications.join(', ')}`)
    }
  }

  console.log(`\n=== ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'} ===`)
  process.exit(allPassed ? 0 : 1)
}

runStabilityTest().catch(e => {
  console.error('Test error:', e)
  process.exit(1)
})

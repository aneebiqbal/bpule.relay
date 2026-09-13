import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'

/**
 * Completes organization onboarding. An admin submits their initial facts,
 * confirms their rubric (which was seeded from bpulse's template at signup),
 * and creates at least one play. After this call, the organization is
 * considered fully set up and the rest of the app becomes usable.
 *
 * Body: {
 *   facts: Array<{ label: string; value: string; factType?: string }>,
 *   plays: Array<{ name: string; situation: string; templateShape: string }>,
 * }
 */
export async function POST(request: Request) {
  let body: {
    facts?: Array<{ label: string; value: string; factType?: string }>
    plays?: Array<{ name: string; situation: string; templateShape: string }>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const store = await createScoutStore()

  const facts = body.facts ?? []
  const plays = body.plays ?? []

  if (facts.length === 0) {
    return NextResponse.json(
      { error: 'At least one fact is required to complete onboarding.' },
      { status: 400 },
    )
  }
  if (plays.length === 0) {
    return NextResponse.json(
      { error: 'At least one play is required to complete onboarding.' },
      { status: 400 },
    )
  }

  // Replace existing trial facts with the admin's actual facts.
  const existingFacts = await store.listFacts()
  for (const fact of existingFacts) {
    await store.deleteFact(fact.id)
  }
  const savedFacts = []
  for (const fact of facts) {
    if (!fact.label.trim() || !fact.value.trim()) continue
    const saved = await store.upsertFact({
      label: fact.label.trim(),
      value: fact.value.trim(),
      factType: fact.factType ?? null,
    })
    savedFacts.push(saved)
  }

  // Replace auto-seeded plays with the admin's explicit choices.
  const existingPlays = await store.listPlays()
  for (const play of existingPlays) {
    await store.deletePlay(play.id)
  }
  const savedPlays = []
  for (const play of plays) {
    if (!play.name.trim() || !play.situation.trim()) continue
    const saved = await store.createPlay({
      name: play.name.trim(),
      situation: play.situation.trim(),
      templateShape: play.templateShape.trim(),
    })
    savedPlays.push(saved)
  }

  return NextResponse.json({
    ok: true,
    factsCreated: savedFacts.length,
    playsCreated: savedPlays.length,
  })
}

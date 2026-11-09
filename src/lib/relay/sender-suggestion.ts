import type { DbClient } from '@/lib/db/types'
/**
 * Org-wide sender suggestion.
 *
 * A rep can only send from profiles they own or are assigned. But the org may
 * have a profile with much stronger, relevant proof for a given lead. This
 * scores EVERY profile in the org against the lead (skills + proof cards +
 * legacy proof + project technologies) and, when a profile the rep cannot use
 * is clearly stronger, returns it as a suggestion with who holds it — so the
 * rep can hand the lead over or ask an admin for access. Read-only: nothing is
 * assigned or changed.
 */

import { profileDisplayName, profileDisplayRole } from '@/lib/profile-intelligence/legacy-display'

export interface SenderCandidate {
  id: string
  name: string | null
  role: string | null
  platform: string | null
  skills: string[]
  proof: Array<{ text: string; tags: string[]; strong: boolean; verified: boolean }>
  holders: Array<{ repId: string; name: string }>
  accessibleToRep: boolean
}

export interface SenderScore {
  profileId: string
  score: number
  matchedTerms: string[]
  topProof: string | null
}

export interface SenderSuggestion {
  profileId: string
  name: string | null
  role: string | null
  platform: string | null
  score: number
  currentBestScore: number
  /** The sender the rep is actually using, so the copy never says "your best". */
  currentSenderName: string | null
  matchedTerms: string[]
  topProof: string | null
  holders: string[]
  reason: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}.+#\s]/gu, ' ').replace(/\s+/g, ' ').trim()

/** Deterministic lead ↔ profile relevance. Proof outweighs self-declared skills. */
export function scoreSender(candidate: SenderCandidate, leadTerms: string[]): SenderScore {
  const terms = [...new Set(leadTerms.map(norm).filter((t) => t.length > 1))]
  const matched = new Set<string>()
  let score = 0

  const skillSet = new Set(candidate.skills.map(norm))
  for (const t of terms) {
    if (skillSet.has(t) || [...skillSet].some((s) => s.length > 2 && (s.includes(t) || t.includes(s)))) {
      score += 2
      matched.add(t)
    }
  }

  let bestProof: { text: string; points: number } | null = null
  for (const p of candidate.proof) {
    const hay = norm(`${p.text} ${p.tags.join(' ')}`)
    const hits = terms.filter((t) => new RegExp(`(^|\\s)${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(hay))
    if (hits.length === 0) continue
    const points = hits.length * 3 + (p.strong ? 2 : 0) + (p.verified ? 2 : 0)
    score += points
    hits.forEach((h) => matched.add(h))
    if (!bestProof || points > bestProof.points) bestProof = { text: p.text, points }
  }

  return { profileId: candidate.id, score, matchedTerms: [...matched], topProof: bestProof?.text ?? null }
}

/**
 * Suggest a stronger profile the rep does not hold. Only fires when it is
 * clearly better (≥ +5 points and ≥ 1.5× the rep's best), same platform when
 * one is required, so reps are not nagged by marginal differences.
 */
export function pickSuggestion(
  candidates: SenderCandidate[],
  leadTerms: string[],
  opts: { platform?: string | null; currentProfileId?: string | null } = {},
): SenderSuggestion | null {
  const eligible = candidates.filter((c) => !opts.platform || !c.platform || c.platform === opts.platform)
  const scored = eligible.map((c) => ({ c, s: scoreSender(c, leadTerms) }))
  const mine = scored.filter((x) => x.c.accessibleToRep)
  const current = opts.currentProfileId ? mine.find((x) => x.c.id === opts.currentProfileId) : null
  const bestMine = current?.s.score ?? Math.max(0, ...mine.map((x) => x.s.score))
  const others = scored.filter((x) => !x.c.accessibleToRep && x.s.score > 0).sort((a, b) => b.s.score - a.s.score)
  const top = others[0]
  if (!top) return null
  if (top.s.score < bestMine + 5 || top.s.score < bestMine * 1.5) return null

  const holders = top.c.holders.map((h) => h.name)
  const who = holders.length > 0 ? holders.join(', ') : 'an admin'
  const terms = top.s.matchedTerms.slice(0, 4).join(', ')
  return {
    profileId: top.c.id,
    name: top.c.name,
    role: top.c.role,
    platform: top.c.platform,
    score: top.s.score,
    currentBestScore: bestMine,
    currentSenderName: current?.c.name ?? null,
    matchedTerms: top.s.matchedTerms,
    topProof: top.s.topProof,
    holders,
    reason: `${top.c.name ?? 'Another profile'} has stronger proof for this lead${terms ? ` (${terms})` : ''}. ` +
      `Sending from it is more likely to get a reply — ask ${who} to send it, or ask an admin for access.`,
  }
}

/** Loads every active profile in the org with its proof, marking which ones the rep can use. */
export async function loadSenderCandidates(
  client: DbClient,
  orgId: string,
  repId: string,
): Promise<SenderCandidate[]> {
  const { data, error } = await client
    .from('profiles')
    .select(`
      id, rep_id, platform, label, headline, full_name, display_name, current_role,
      primary_skills, secondary_skills, technologies, specialties, service_capabilities
    `)
    .eq('organization_id', orgId)
    .is('archived_at', null)
  if (error) throw error

  const profileIds = (data ?? []).map((p: any) => p.id as string)
  const ownerIds = (data ?? []).map((p: any) => p.rep_id as string).filter(Boolean)

  // The owner, the assignments, the identity holders and the proof tables used
  // to arrive as PostgREST embeds, which the Neon adapter cannot translate.
  // They are batched reads over the page's ids.
  const [ownerRows, assignmentRows, proofCardRows, proofItemRows, portfolioRows, identityHolders] = await Promise.all([
    ownerIds.length > 0 ? client.from('reps').select('id, name').in('id', ownerIds) : Promise.resolve({ data: [] }),
    profileIds.length > 0 ? client.from('profile_assignments').select('rep_id, profile_id').in('profile_id', profileIds) : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? client.from('proof_cards').select('profile_id, safe_claim, capability, tags, strength, verified').in('profile_id', profileIds)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? client.from('proof_items').select('profile_id, project_summary, tags, review_quote, permission_on_file').in('profile_id', profileIds)
      : Promise.resolve({ data: [] }),
    profileIds.length > 0
      ? client.from('portfolio_projects').select('profile_id, project_title, description, technologies').in('profile_id', profileIds)
      : Promise.resolve({ data: [] }),
    client
      .from('identity_assignments')
      .select('rep_id, revenue_identity_id')
      .eq('organization_id', orgId),
  ])

  const ownerNameById = new Map((ownerRows.data ?? []).map((r: any) => [r.id as string, r.name as string]))
  const assignedRepIds = (assignmentRows.data ?? []).map((a: any) => a.rep_id as string).filter(Boolean)
  const holderRepIds = (identityHolders.data ?? []).map((r: any) => r.rep_id as string).filter(Boolean)
  const allRepIds = [...new Set([...assignedRepIds, ...holderRepIds])]
  const repNameById = new Map<string, string>()
  if (allRepIds.length > 0) {
    const { data: reps } = await client.from('reps').select('id, name').in('id', allRepIds)
    for (const r of reps ?? []) repNameById.set(r.id as string, r.name as string)
  }

  const groupByProfile = <T extends { profile_id: string }>(rows: T[] | null | undefined) => {
    const map = new Map<string, T[]>()
    for (const r of rows ?? []) {
      const list = map.get(r.profile_id as string) ?? []
      list.push(r)
      map.set(r.profile_id as string, list)
    }
    return map
  }
  const cardsByProfile = groupByProfile(proofCardRows.data as any[])
  const itemsByProfile = groupByProfile(proofItemRows.data as any[])
  const portfolioByProfile = groupByProfile(portfolioRows.data as any[])
  const assignmentsByProfile = groupByProfile(assignmentRows.data as any[])

  // Reps assigned a sending identity built from a profile can send as it too.
  const holdersByProfile = new Map<string, Array<{ id: string; name: string }>>()
  const holderIdentityIds = (identityHolders.data ?? []).map((r: any) => r.revenue_identity_id as string).filter(Boolean)
  if (holderIdentityIds.length > 0) {
    const { data: identityRows } = await client
      .from('revenue_identities')
      .select('id, profile_id, status')
      .in('id', holderIdentityIds)
    for (let i = 0; i < (identityHolders.data ?? []).length; i++) {
      const holder = (identityHolders.data ?? [])[i] as any
      const identity = (identityRows ?? []).find((r: any) => r.id === holder.revenue_identity_id) as any
      if (!identity?.profile_id || identity.status === 'archived' || !holder.rep_id) continue
      holdersByProfile.set(identity.profile_id, [
        ...(holdersByProfile.get(identity.profile_id) ?? []),
        { id: holder.rep_id, name: repNameById.get(holder.rep_id) ?? 'Unknown' },
      ])
    }
  }

  return (data ?? []).map((p: any) => {
    const holders = new Map<string, string>()
    for (const a of assignmentsByProfile.get(p.id) ?? []) {
      holders.set(a.rep_id, repNameById.get(a.rep_id) ?? 'Unknown')
    }
    for (const r of holdersByProfile.get(p.id) ?? []) holders.set(r.id, r.name)
    if (p.rep_id) holders.set(p.rep_id, ownerNameById.get(p.rep_id) ?? 'Unknown')
    const owner = p.rep_id ? { id: p.rep_id, name: ownerNameById.get(p.rep_id) ?? 'Unknown' } : null
    const proofCards = cardsByProfile.get(p.id) ?? []
    const proofItems = itemsByProfile.get(p.id) ?? []
    const portfolioProjects = portfolioByProfile.get(p.id) ?? []
    // A malformed jsonb column (object instead of array) must not crash routing.
    const asArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
    const skills = [
      ...asArray(p.primary_skills), ...asArray(p.secondary_skills), ...asArray(p.technologies),
      ...asArray(p.specialties), ...asArray(p.service_capabilities),
      ...portfolioProjects.flatMap((pp: any) => asArray(pp.technologies)),
    ].filter((s: unknown): s is string => typeof s === 'string')
    return {
      id: p.id,
      name: profileDisplayName({ ...p, rep: owner }),
      role: profileDisplayRole(p),
      platform: p.platform ?? null,
      skills: [...new Set(skills)],
      proof: [
        ...proofCards.map((c: any) => ({ text: c.safe_claim, tags: [...(c.tags ?? []), c.capability ?? ''], strong: c.strength === 'strong', verified: !!c.verified })),
        ...proofItems.map((i: any) => ({ text: i.project_summary, tags: i.tags ?? [], strong: !!i.review_quote, verified: !!i.permission_on_file })),
        ...portfolioProjects.map((pp: any) => ({ text: [pp.project_title, pp.description].filter(Boolean).join(' — '), tags: pp.technologies ?? [], strong: false, verified: false })),
      ].filter((x) => x.text),
      holders: [...holders].map(([id, name]) => ({ repId: id, name })),
      accessibleToRep: p.rep_id === repId || holders.has(repId),
    }
  })
}

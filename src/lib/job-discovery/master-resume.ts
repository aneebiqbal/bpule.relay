import { createHash } from 'node:crypto'
import type { DbClient } from '@/lib/db/types'
import type { Profile } from '@/lib/domain/types'
import type { ProfileEvidence } from '@/lib/generation/sales-context'
import type { ResumeData } from '@/lib/bd/resume-engine'

/**
 * Versioned, job-independent master resume.
 *
 * The master resume is derived only from verified profile evidence. A new
 * version is written only when the evidence actually changes; otherwise the
 * current version is returned (idempotent).
 */

export function masterResumeHash(profile: Profile, evidence: ProfileEvidence): string {
  return createHash('sha256').update(JSON.stringify({
    profileId: profile.id,
    displayName: profile.displayName ?? profile.fullName ?? profile.label,
    headline: profile.headline,
    summary: profile.professionalSummary ?? profile.bio,
    skills: [profile.primarySkills ?? [], profile.secondarySkills ?? [], profile.technologies ?? []],
    experience: evidence.experience,
    proofCards: evidence.proofCards.map((card) => ({ id: card.id, capability: card.capability, claim: card.safeClaim, tags: card.tags, strength: card.strength, verified: card.verified })),
    projects: evidence.portfolioProjects,
  })).digest('hex')
}

export async function latestMasterResume(
  db: DbClient,
  orgId: string,
  profileId: string,
): Promise<{ version: number; content: ResumeData; sourceHash: string } | null> {
  const result = await db.raw!<Array<{ version: number; content: unknown; source_hash: string }>>(
    `select version, content, source_hash from master_resumes
     where organization_id = ? and profile_id = ?
     order by version desc limit 1`,
    [orgId, profileId],
  )
  if (result.error) throw new Error(result.error.message)
  const row = result.data?.[0]
  return row ? { version: row.version, content: row.content as ResumeData, sourceHash: row.source_hash } : null
}

export async function saveMasterResume(
  db: DbClient,
  orgId: string,
  profileId: string,
  content: ResumeData,
  sourceHash: string,
): Promise<{ version: number }> {
  const latest = await latestMasterResume(db, orgId, profileId)
  const version = (latest?.version ?? 0) + 1
  const result = await db.raw!(
    `insert into master_resumes (organization_id, profile_id, version, content, source_hash)
     values (?, ?, ?, ?::jsonb, ?)`,
    [orgId, profileId, version, JSON.stringify(content), sourceHash],
  )
  if (result.error) throw new Error(result.error.message)
  return { version }
}

/** Return the current master resume, or create version 1. Idempotent. */
export async function getOrCreateMasterResume(
  db: DbClient,
  orgId: string,
  profileId: string,
  content: ResumeData,
  sourceHash: string,
): Promise<{ version: number; content: ResumeData; created: boolean }> {
  const latest = await latestMasterResume(db, orgId, profileId)
  if (latest && latest.sourceHash === sourceHash) {
    return { version: latest.version, content: latest.content, created: false }
  }
  const saved = await saveMasterResume(db, orgId, profileId, content, sourceHash)
  return { version: saved.version, content, created: true }
}

/**
 * Loads the canonical profile evidence for the generation context.
 *
 * One batched read of every proof-bearing table for a profile: verified proof
 * cards, legacy proof items, portfolio projects, role history, client reviews
 * and approved claims. Nothing is inferred and nothing is invented — a missing
 * table yields an empty list, so a partial profile still generates.
 */
import type { DbClient } from '@/lib/db/types'
import type {
  GenerationClaimRow,
  GenerationExperience,
  GenerationPortfolioProject,
  GenerationReview,
  ProfileEvidence,
} from '@/lib/generation/sales-context'

const LIMIT = 50

export async function loadProfileEvidence(
  client: DbClient,
  profileId: string,
): Promise<ProfileEvidence> {
  const [proofCards, proofItems, portfolioProjects, experience, reviews, claims] = await Promise.all([
    client.from('proof_cards').select('*').eq('profile_id', profileId).limit(LIMIT),
    client.from('proof_items').select('*').eq('profile_id', profileId).limit(LIMIT),
    client.from('portfolio_projects').select('*').eq('profile_id', profileId).limit(LIMIT),
    client.from('profile_experience').select('*').eq('profile_id', profileId).limit(LIMIT),
    client.from('profile_reviews').select('*').eq('profile_id', profileId).limit(LIMIT),
    client.from('profile_claims').select('*').eq('profile_id', profileId).limit(LIMIT),
  ])

  return {
    proofCards: (proofCards.data ?? []).map(
      (row): ProfileEvidence['proofCards'][number] => ({
        id: String(row.id),
        organizationId: String(row.organization_id),
        profileId: String(row.profile_id),
        capability: String(row.capability),
        strength: (row.strength as 'strong' | 'moderate' | 'weak') ?? 'moderate',
        safeClaim: String(row.safe_claim ?? ''),
        sourceType: (row.source_type as ProfileEvidence['proofCards'][number]['sourceType']) ?? 'approved_fact',
        sourceReference: (row.source_reference as string | null) ?? null,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        verified: Boolean(row.verified),
        forbiddenClaims: Array.isArray(row.forbidden_claims) ? (row.forbidden_claims as string[]) : [],
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at),
      }),
    ),
    proofItems: (proofItems.data ?? []).map(
      (row): ProfileEvidence['proofItems'][number] => ({
        id: String(row.id),
        organizationId: String(row.organization_id),
        profileId: String(row.profile_id),
        clientNamed: Boolean(row.client_named),
        clientName: (row.client_name as string | null) ?? null,
        permissionOnFile: Boolean(row.permission_on_file),
        projectSummary: String(row.project_summary ?? ''),
        reviewQuote: (row.review_quote as string | null) ?? null,
        tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
        createdAt: String(row.created_at),
      }),
    ),
    portfolioProjects: (portfolioProjects.data ?? []).map(
      (row): GenerationPortfolioProject => ({
        id: String(row.id),
        title: String(row.project_title ?? 'Project'),
        role: (row.my_role as string | null) ?? null,
        description: (row.description as string | null) ?? null,
        technologies: Array.isArray(row.technologies) ? (row.technologies as string[]) : [],
        clientCompany: (row.client_company as string | null) ?? null,
        outcome: (row.outcome as string | null) ?? null,
        startDate: (row.start_date as string | null) ?? null,
        endDate: (row.end_date as string | null) ?? null,
      }),
    ),
    experience: (experience.data ?? []).map(
      (row): GenerationExperience => ({
        id: String(row.id),
        role: (row.role as string | null) ?? null,
        company: (row.company as string | null) ?? null,
        startDate: (row.start_date as string | null) ?? null,
        endDate: (row.end_date as string | null) ?? null,
        isCurrent: Boolean(row.is_current),
      }),
    ),
    reviews: (reviews.data ?? []).map(
      (row): GenerationReview => ({
        id: String(row.id),
        text: String(row.review_text ?? ''),
        reviewerName: (row.reviewer_name as string | null) ?? null,
        reviewerCompany: (row.reviewer_company as string | null) ?? null,
        projectContext: (row.project_context as string | null) ?? null,
        safeForOutreach: Boolean(row.safe_for_outreach),
      }),
    ),
    claims: (claims.data ?? []).map(
      (row): GenerationClaimRow => ({
        id: String(row.id),
        key: String(row.claim_key ?? ''),
        value: String(row.claim_value ?? ''),
        inferred: Boolean(row.is_inferred),
        userCorrected: Boolean(row.user_corrected),
        userRejected: Boolean(row.user_rejected),
      }),
    ),
  }
}

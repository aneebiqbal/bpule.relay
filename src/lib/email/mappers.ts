import type {
  ContactPoint,
  EmailClaimSafetyResult,
  EmailMessageMeta,
  PreparedEmailDraft,
  ResearchBrief,
  EmailStrategy,
} from '@/lib/domain/types'

type Row = Record<string, unknown>

export function mapContactPoint(row: Row): ContactPoint {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    leadId: (row.lead_id as string) ?? null,
    personId: (row.person_id as string) ?? null,
    companyId: (row.company_id as string) ?? null,
    type: row.type as ContactPoint['type'],
    value: row.value as string,
    source: row.source as ContactPoint['source'],
    sourceUrl: (row.source_url as string) ?? null,
    sourceType: (row.source_type as string) ?? null,
    verificationStatus: row.verification_status as ContactPoint['verificationStatus'],
    verificationMethod: (row.verification_method as string) ?? null,
    confidence: (row.confidence as number) ?? null,
    isPrimary: Boolean(row.is_primary),
    isBusinessContact: Boolean(row.is_business_contact),
    discoveredAt: row.discovered_at as string,
    verifiedAt: (row.verified_at as string) ?? null,
    lastUsedAt: (row.last_used_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function mapPreparedEmailDraft(row: Row): PreparedEmailDraft {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    leadId: row.lead_id as string,
    revenueIdentityId: row.revenue_identity_id as string,
    contactPointId: (row.contact_point_id as string) ?? null,
    contactEmail: (row.contact_email as string) ?? null,
    draftStatus: row.draft_status as PreparedEmailDraft['draftStatus'],
    relationshipType: (row.relationship_type as string) ?? null,
    opportunityType: (row.opportunity_type as string) ?? null,
    emailGoal: (row.email_goal as PreparedEmailDraft['emailGoal']) ?? null,
    subject: (row.subject as string) ?? null,
    subjectCandidates: Array.isArray(row.subject_candidates) ? (row.subject_candidates as string[]) : [],
    body: (row.body as string) ?? null,
    strategy: (row.strategy as EmailStrategy | null) ?? null,
    researchBrief: (row.research_brief as ResearchBrief | null) ?? null,
    claimSafety: (row.claim_safety as EmailClaimSafetyResult | null) ?? null,
    editDisposition: (row.edit_disposition as PreparedEmailDraft['editDisposition']) ?? null,
    isFollowup: Boolean(row.is_followup),
    followupSequence: (row.followup_sequence as number) ?? 0,
    evidenceUsed: Array.isArray(row.evidence_used) ? (row.evidence_used as string[]) : [],
    blockedReason: (row.blocked_reason as string) ?? null,
    createdBy: (row.created_by as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

export function mapEmailMessage(row: Row): EmailMessageMeta {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    leadId: row.lead_id as string,
    messageId: (row.message_id as string) ?? null,
    preparedDraftId: (row.prepared_draft_id as string) ?? null,
    revenueIdentityId: row.revenue_identity_id as string,
    mailboxId: row.mailbox_id as string,
    contactPointId: (row.contact_point_id as string) ?? null,
    direction: row.direction as EmailMessageMeta['direction'],
    category: row.category as EmailMessageMeta['category'],
    idempotencyKey: row.idempotency_key as string,
    subject: row.subject as string,
    body: row.body as string,
    provider: row.provider as string,
    providerMessageId: (row.provider_message_id as string) ?? null,
    providerThreadId: (row.provider_thread_id as string) ?? null,
    deliveryStatus: row.delivery_status as EmailMessageMeta['deliveryStatus'],
    sentAt: (row.sent_at as string) ?? null,
    deliveredAt: (row.delivered_at as string) ?? null,
    bouncedAt: (row.bounced_at as string) ?? null,
    repliedAt: (row.replied_at as string) ?? null,
    lastEventAt: (row.last_event_at as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

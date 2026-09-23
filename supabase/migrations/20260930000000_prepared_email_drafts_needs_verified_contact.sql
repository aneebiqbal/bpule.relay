-- 20260930: Allow NEEDS_VERIFIED_CONTACT as a real prepared_email_drafts.draft_status
--
-- prepareEmailDraft() (src/lib/email/service.ts) generates content
-- unconditionally when legitimate, then uses isSendEligibleContact() to
-- decide READY vs a distinct "content exists, but the contact isn't send-
-- eligible yet" state — NEEDS_VERIFIED_CONTACT. The original CHECK
-- constraint (20260925000000_email_outreach_foundation.sql) only allowed
-- 'CONTACT_NOT_FOUND', which conflates "no contact was found at all" with
-- "a contact exists but is unverified/inferred" — two different situations
-- that need different next actions. Without this migration, inserting
-- NEEDS_VERIFIED_CONTACT directly violates the CHECK constraint, which had
-- been worked around by persisting CONTACT_NOT_FOUND and patching the
-- in-memory return value back afterward — a real duplicate-source-of-truth
-- bug (the persisted row and the API response could disagree). This
-- migration removes the need for that workaround.

alter table prepared_email_drafts drop constraint if exists prepared_email_drafts_draft_status_check;
alter table prepared_email_drafts add constraint prepared_email_drafts_draft_status_check check (draft_status in (
  'DRAFT', 'RESEARCH_REQUIRED', 'CONTACT_NOT_FOUND', 'NEEDS_VERIFIED_CONTACT', 'SKIP', 'READY', 'SENT', 'FAILED'
));

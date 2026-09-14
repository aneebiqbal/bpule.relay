/**
 * Relay Analytics Event Taxonomy
 *
 * Privacy-first product analytics. We track behavior, not content.
 *
 * Rules:
 * - Never send passwords, tokens, message bodies, draft content, resumes
 * - Track events, not surveillance
 * - Associate with internal user ID after authentication
 * - Disable in development/test
 */

export const AnalyticsEvents = {
  // ── Acquisition ──
  LANDING_VIEWED: "landing_viewed",
  PRICING_VIEWED: "pricing_viewed",
  PRODUCT_SECTION_VIEWED: "product_section_viewed",
  START_FREE_CLICKED: "start_free_clicked",

  // ── Authentication ──
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",
  VERIFICATION_COMPLETED: "verification_completed",
  LOGIN_COMPLETED: "login_completed",
  ACTIVATION_STARTED: "activation_started",
  ACTIVATION_COMPLETED: "activation_completed",

  // ── Revenue / Prospect ──
  PROSPECT_CHECK_STARTED: "prospect_check_started",
  PROSPECT_CHECK_COMPLETED: "prospect_check_completed",
  LEAD_SAVED: "lead_saved",
  OUTREACH_GENERATED: "outreach_generated",
  FOLLOWUP_GENERATED: "followup_generated",
  REPLY_GENERATED: "reply_generated",
  LEAD_STAGE_CHANGED: "lead_stage_changed",
  LEAD_WON: "lead_won",

  // ── Jobs / Upwork ──
  JOB_OPENED: "job_opened",
  PROPOSAL_GENERATED: "proposal_generated",

  // ── Studio ──
  PERSONA_CREATED: "persona_created",
  PERSONA_ONBOARDING_COMPLETED: "persona_onboarding_completed",
  STUDIO_TODAY_VIEWED: "studio_today_viewed",
  STUDIO_IDEA_SELECTED: "studio_idea_selected",
  STUDIO_IDEA_REJECTED: "studio_idea_rejected",
  QUICK_CAPTURE_SUBMITTED: "quick_capture_submitted",
  STUDIO_DRAFT_GENERATED: "studio_draft_generated",
  STUDIO_DRAFT_EDITED: "studio_draft_edited",
  STUDIO_DRAFT_POSTED: "studio_draft_posted",
  STUDIO_VISUAL_USED: "studio_visual_used",

  // ── Usage / Quota ──
  GENERATION_CONSUMED: "generation_consumed",
  PROSPECT_CONSUMED: "prospect_consumed",
  LIMIT_WARNING: "limit_warning",
  LIMIT_REACHED: "limit_reached",

  // ── Failures ──
  GENERATION_FAILED: "generation_failed",
  AUTOSAVE_FAILED: "autosave_failed",
  ONBOARDING_FAILED: "onboarding_failed",
  PROSPECT_CHECK_FAILED: "prospect_check_failed",
  AUTH_FAILED: "auth_failed",
  QUOTA_REJECTED: "quota_rejected",
  PROVIDER_FALLBACK_USED: "provider_fallback_used",

  // ── Navigation ──
  PAGE_VIEW: "page_view",
} as const;

export type AnalyticsEventType = (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents];

/**
 * Properties that can accompany any event.
 */
export interface AnalyticsProperties {
  // Attribution
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;

  // Session
  landing_page?: string;
  anonymous_id?: string;

  // Event-specific
  section_name?: string;
  plan_type?: string;
  message_type?: string;
  platform?: string;
  score?: number;
  lead_status?: string;
  persona_id?: string;
  generation_type?: string;
  error_code?: string;
  provider?: string;
  [key: string]: string | number | boolean | undefined;
}

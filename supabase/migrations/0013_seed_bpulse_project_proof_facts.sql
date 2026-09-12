-- 0013: Seed bpulse project-proof context into facts.
--
-- This stores only user-provided / verified context as structured JSON text in
-- facts.value, with fact_type = 'project_proof'. No metrics are invented.

with seed(project_name, url, fetch_status, product_description, bpulse_contribution, permission_to_name_publicly, outreach_safe_sentence, source_confidence) as (
  values
    (
      'DeepIDV'::text,
      'https://deepidv.com'::text,
      'fetched'::text,
      'Identity verification platform with deepfake detection, compliance checks, and API/SDK-driven risk workflows.'::text,
      'Frontend, backend, integrations, automation, Shopify integration, AWS infrastructure, and production bug work (repo facts).'::text,
      'not_asked'::text,
      'Compliance-heavy identity stack where bpulse handled cross-platform product and integration delivery in production conditions.'::text,
      'repo_plus_fetch'::text
    ),
    (
      'Sully.ai'::text,
      'https://sully.ai'::text,
      'fetched'::text,
      'AI workforce tooling for healthcare operations (scribe, triage, receptionist, coding, integrations).'::text,
      'Integration dashboard, SDK docs/auth layer, RBAC under HIPAA constraints, monitoring dashboards, alerts, and medical-doc model work (repo facts).'::text,
      'not_asked'::text,
      'Healthcare AI platform where bpulse shipped integration and access-control infrastructure for real clinical workflows.'::text,
      'repo_plus_fetch'::text
    ),
    (
      'myUsta'::text,
      'https://app.myusta.al'::text,
      'fetched'::text,
      'Albanian marketplace connecting homeowners with local service professionals.'::text,
      'Mobile and web delivery with React Native and Next.js, including frontend/backend and deployments (repo facts).'::text,
      'not_asked'::text,
      'Two-sided marketplace shipped across app and web surfaces with bpulse owning end-to-end delivery execution.'::text,
      'repo_plus_fetch'::text
    ),
    (
      'IndoorGIS'::text,
      null::text,
      'repo_mentioned_only'::text,
      'Indoor mapping and positioning platform work.'::text,
      'Mapping stack platform implementation contribution (repo facts).'::text,
      'not_asked'::text,
      'Location and mapping infrastructure work where bpulse contributed to core platform implementation.'::text,
      'repo_only'::text
    ),
    (
      'SBA 504 Loan Hub'::text,
      'https://sba504loanhub.com/'::text,
      'fetched'::text,
      'Educational and lead-routing site for SBA 504 financing.'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'Finance-information platform focused on SBA 504 eligibility, process clarity, and lender connection.'::text,
      'url_snapshot_only'::text
    ),
    (
      'WearMeOut'::text,
      'https://wearmeout-frontend.onrender.com/'::text,
      'partial_fetch_title_only'::text,
      'Likely fashion or wardrobe product; page content extraction was limited in this session.'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'Early-stage app endpoint is live, with deeper product proof still pending verification.'::text,
      'url_snapshot_only'::text
    ),
    (
      'Mythos Archive'::text,
      'https://www.mythosarchive.org/'::text,
      'fetched'::text,
      'AI-powered mythology discovery app with stories, sources, and guided exploration.'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'Content-rich mythology learning concept with AI-assisted exploration flows.'::text,
      'url_snapshot_only'::text
    ),
    (
      'Clarence AI'::text,
      'https://clarenceai.com/'::text,
      'partial_fetch_title_only'::text,
      'Social-media operations platform (from available page title during fetch).'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'Ops-focused marketing tool requiring deeper scrape before contribution proof can be claimed.'::text,
      'url_snapshot_only'::text
    ),
    (
      'Evidero'::text,
      'https://evidero.io/'::text,
      'fetched'::text,
      'Security questionnaire automation with sourced evidence and EU regulatory mapping.'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'Compliance workflow product focused on traceable answers and audit readiness for EU B2B teams.'::text,
      'url_snapshot_only'::text
    ),
    (
      'Fullscript'::text,
      'https://fullscript.com'::text,
      'fetched'::text,
      'Provider-facing platform for supplement plans, adherence, labs, and patient follow-through.'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'Healthcare workflow platform centered on treatment planning and ongoing patient execution.'::text,
      'url_snapshot_only'::text
    ),
    (
      'OLX / OLX Group'::text,
      'https://olxgroup.com'::text,
      'olx_com_blocked_fallback_fetched'::text,
      'AI-native classifieds and marketplace group spanning jobs, homes, cars, and local commerce.'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'Large-scale marketplace ecosystem profile captured via OLX Group when direct OLX domain was bot-protected.'::text,
      'url_snapshot_only'::text
    ),
    (
      'Dubizzle'::text,
      'https://dubizzle.com'::text,
      'bot_protected'::text,
      'Major regional classifieds marketplace brand (high-level public profile only in this session).'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'Known marketplace brand; direct content capture was blocked in this runtime.'::text,
      'url_snapshot_only'::text
    ),
    (
      'FoodKarma'::text,
      'https://foodkarma.ae'::text,
      'unreachable_transport_error'::text,
      'Product details could not be fetched from this runtime session.'::text,
      'Not documented in repo.'::text,
      'not_asked'::text,
      'URL is recorded, but product proof details require a successful fetch or first-party notes.'::text,
      'url_snapshot_only'::text
    )
)
insert into facts (label, value, fact_type, added_by)
select
  'Project proof - ' || s.project_name,
  jsonb_build_object(
    'project_name', s.project_name,
    'url', s.url,
    'fetch_status', s.fetch_status,
    'product_description', s.product_description,
    'bpulse_contribution', s.bpulse_contribution,
    'permission_to_name_publicly', s.permission_to_name_publicly,
    'outreach_safe_sentence', s.outreach_safe_sentence,
    'source_confidence', s.source_confidence
  )::text,
  'project_proof',
  (select id from reps where role = 'admin' order by created_at asc limit 1)
from seed s
where not exists (
  select 1
  from facts f
  where f.label = 'Project proof - ' || s.project_name
);

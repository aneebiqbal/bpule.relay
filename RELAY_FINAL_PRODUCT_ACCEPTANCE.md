# Relay Final Product Acceptance (Targeted Re-Run)

Last updated: 2026-09-23

## Environment snapshot

- Branch: `main`
- Credentials missing for live-provider intelligence benchmark:
  - `OPENCODE_API_KEY`
  - `GROQ_API_KEY`
  - `OPENAI_API_KEY`
  - `LONGCAT_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` is present (DB verification paths are active)

## Current matrix evidence

1. `pnpm -s tsc --noEmit` -> **PASS**
2. `pnpm -s build` -> **PASS**
3. Email backend tests (`tests/email-prepare-send-api.integration.test.ts`, `tests/email-webhook-lifecycle.integration.test.ts`, `tests/email-claim-safety.test.ts`, `tests/email-contact-points.test.ts`) -> **PASS** (`23 passed`)
4. Priority-1 suites:
   - `e2e/p0-workflow-proof.spec.ts` -> **PASS** (`6 passed`)
   - `e2e/product-test-c.spec.ts` -> **FAIL** (`2 passed, 1 failed`)
     - Blocking failure: `C1` cannot prove CV persistence because Supabase table `tailored_cvs` is missing in active environment (`PGRST205`).
5. Priority-2 suites:
   - `e2e/leads.spec.ts` -> **PASS** (`10 passed`)
   - `e2e/targets-feature.spec.ts` -> **PASS** (`6 passed`)
6. Priority-3 suite:
   - `e2e/smoke.spec.ts --project=mobile-iphone` -> **PASS** (`6 passed, 1 skipped`)
7. Priority-4 suite:
   - `e2e/canonical-intelligence-consistency.spec.ts` -> **PASS** (`3 passed`)
8. Priority-5 benchmark:
   - `pnpm -s intelligence:benchmark -- --include-torture` -> **FAIL**
   - Runtime stays fallback-only (`provider=none`) with many invariant failures.
9. Priority-6 Email V1 browser gate:
   - `RUN_EMAIL_ACCEPTANCE=1 pnpm -s playwright test e2e/email-outreach-v1.spec.ts --project=desktop-chrome --retries=0` -> **PASS** (`1 passed`)
10. Full Playwright matrix snapshots:
   - Desktop full run: **FAIL** (`165 passed`, `2 failed`, `2 skipped`)
     - failures at run time: `product-test-c/C1` (schema blocker), `product-test-c/T1` (fixed in targeted rerun)
   - Mobile full run: **FAIL** (`163 passed`, `4 failed`, `2 skipped`)
     - failures at run time: `p0/A2`, `p0/C1`, `product-test-c/C1`, `product-test-c/T1`
     - targeted reruns after fixes now pass `p0` (all 6) and `product-test-c/T1`; remaining blocker is `product-test-c/C1`.

## Changes made in this pass

- `e2e/p0-workflow-proof.spec.ts`
  - Stabilized login/navigation waits and prospect analysis waits.
  - Replaced brittle send-path setup with quota-safe reply fixtures for A4/C1.
  - Added DB-backed duplicate check for A3 when service-role env is available.
- `e2e/product-test-c.spec.ts`
  - Switched C1 generation proof to contract-safe API flow with profile lookup.
  - Added explicit blocker message when `tailored_cvs` table is absent.
  - Updated C2/T1 selectors and timeline setup for current UI behavior.
- `e2e/targets-feature.spec.ts`
  - Fixed T06 lane assertion to scope inside visible rep lane instead of hidden option text.
- `e2e/email-outreach-v1.spec.ts`
  - Executed gate under `RUN_EMAIL_ACCEPTANCE=1`.
  - Added email-identity provisioning fallback and verified-contact setup.
  - Updated bulk assertions to reflect generated-but-unsendable drafts for missing contacts.
- `src/app/api/admin/revenue-identities/route.ts`
  - Added compatibility insert retry for environments missing newer identity columns (`source_kind`, `forbidden_claims`, `channel_rules`).
- `src/lib/email/service.ts`
  - Restored semantic status `NEEDS_VERIFIED_CONTACT` while persisting as `CONTACT_NOT_FOUND` for legacy DB constraints.
- `src/app/api/revenue/email/prepare/route.ts`
  - Summary now counts both `CONTACT_NOT_FOUND` and `NEEDS_VERIFIED_CONTACT` for compatibility.
- `src/lib/store/supabase-store.ts`
  - Fixed `ats_dimensions` persistence to store structured JSON (not stringified payload).

## Remaining blockers

1. **P1 blocker**: `tailored_cvs` table is missing in active Supabase project, so `PRODUCT TEST C / C1` cannot pass end-to-end persistence proof.
   - Required action: apply migration `supabase/migrations/0087_tailored_cv_persistence.sql` (or equivalent schema rollout in target environment).
2. **P5 blocker**: benchmark still fails with fallback-only runtime and missing live-provider credentials.

## Verdict

**NOT READY**

The prioritized matrix is much healthier, but release readiness is still blocked by:

1. Missing `tailored_cvs` schema in target Supabase environment (hard fail in Priority-1 C1).
2. Intelligence benchmark gate failing under current credential/runtime posture.

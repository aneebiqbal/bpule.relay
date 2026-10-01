# Relay Hardening Sprint — Baseline (Phase 0)

Recorded: 2026-09-22
Recorded by: Claude (Sonnet 5), per user confirmation to begin the hardening sprint.

## Baseline Commit

- **SHA**: `7e0f3a17f573867b53af2ad21b0cea8399acd31a`
- **Branch**: `main`
- **Working tree**: clean except one untracked file:
  - `scripts/_set-owner-admin-roles.mjs` — a one-off admin script that promotes named individuals (Aneeb, Hassan) to OWNER/ADMIN org roles via the Supabase service-role key. **Not run, not modified.** Out of scope for hardening (it's a manual ops script, not test/build tooling); executing it would be an irreversible production auth/role change requiring separate explicit authorization. Left untouched and unstaged.
- Last 5 commits before baseline:
  - `7e0f3a1` fix(ui): keep button labels readable in light and dark
  - `909fada` feat(benchmark): include torture cases and lead audit tooling
  - `3584117` **Email Outreach V1: grounded preparation, authorized sending and lifecycle** — this is the frozen SHA referenced by Phase 28 of the sprint brief. Confirmed present in history.
  - `aef5505` fix(admin): let product admins see org work without bouncing or zeros
  - `aab421a` fix(targets): auto-assign the standard daily pack when work is given to a rep
- Other local/remote branches (not evaluated, not merged): `fix-draft-self-check-and-corrective-retry`, `model-architecture-v2-deepseek-tiers`, `team-wide-lead-visibility`, `adding-git-variety`.

## Test Suite (`npx vitest run`)

- **Result: 807 passed / 12 failed** (819 total across 51 files; 46 files fully green, 5 files with failures)
- TypeScript typecheck (`npx tsc --noEmit`): **PASS**, 0 errors.
- Production build (`npm run build`, Next.js 16.3.4 / Turbopack): **PASS**, compiled successfully, TS check within build passed, all routes generated.

### Pre-existing failing tests (NOT introduced by this sprint — recorded as known baseline failures)

1. `tests/bd-draft-quality.test.ts` — "includes the signal evidence"
2. `tests/bd-pipeline.test.ts` — "drafts and sanitizes real outreach for a send-verdict lead"
3. `tests/forge-premium.test.ts` (4 failures) — visual concept inclusion, structure selection, stock-imagery check, evaluation scores
4. `tests/intelligence-v2-benchmark.test.ts` (3 failures) — remote-eligibility classification:
   - "Remote Senior Fullstack — Vercel competitor" expected ELIGIBLE, not matching
   - "Founding Engineer — Series A SaaS" expected ELIGIBLE, not matching
   - "Hybrid — San Francisco" expected INELIGIBLE, not matching
   - **This directly overlaps Phase 3/8/10 (determinism, scoring, temporal/eligibility correctness) — high-priority target for Day 2-3 investigation, not just a baseline footnote.**
5. `tests/revenue-intelligence-insights.test.ts` (3 failures) — severity classification mismatches (`WATCH` vs `SUSPICIOUS`, `ACTION` vs `SUSPICIOUS`) and funnel-ordering validation (`validateFunnelOrdering` returned 1 issue, expected 0).

None of these will be attributed to new hardening changes. Each will get root-caused under Phase 63 (root cause rule) rather than patched superficially, in the order the Day-by-day plan calls for (intelligence/scoring first).

## E2E Status

- Full 27-spec Playwright suite (`e2e/*.spec.ts`) was **not executed in Phase 0** — running it requires a live dev server against configured Supabase + AI provider credentials, which is a heavier, longer-running operation than the baseline gate needs. Will run per-feature as each day's work is picked up (per Phase 75 schedule), starting with `email-outreach-v1.spec.ts` regression since it's the frozen-feature contract.
- Most recent known-good E2E evidence (pre-dating this sprint): `e2e-results.json` / `RELEASE_GATE.md` — Gate 3 (`e2e/email-outreach-v1.spec.ts`, desktop-chrome): **1 passed**, runtime 3.4m, dated 2026-09-21.
- Prior full-suite E2E baseline from `BUG_LEDGER.md` "Final Hardening Results" (previous bug-bash round, not re-verified today): 108 passed / 11 failed (demo mode, desktop-chrome).

## Database / Migration State

- 74 migrations present under `supabase/migrations/`, most recent: `20260925000000_email_outreach_foundation.sql`.
- Canonical intelligence architecture is **already partially implemented**, not greenfield:
  - `0092_canonical_intelligence.sql` adds `canonical_score`, `score_version`, `scored_at`, `canonical_intelligence` (jsonb), `raw_source_data`, `score_breakdown`, `remote_eligibility`, `evidence_ledger`, `extraction_completeness`, `rescore_events[]` to `leads`, plus an `append_rescore_event` RPC.
  - This means Phase 4/6/7 work is an **audit of what's implemented vs. actually enforced end-to-end**, not new design. Will verify whether all surfaces (Prospect Check, Lead Detail, Today, Revenue Intelligence, etc.) actually read from these canonical columns or still recompute independently — this is the Phase 2 "sources of truth" investigation for Day 1.
- `BUG_LEDGER.md` records **P0-01 (corrupted Supabase service-role key)** as a previously blocking issue. Confirmed **RESOLVED** per `RELEASE_AUDIT.md` ("SUPABASE_SERVICE_ROLE_KEY ... now decodes to a valid JWT"). Service-role ops (signup, cron, migrations) should be functional; will re-verify empirically rather than assume when first touching an affected path.
- `.env.local` has 4 configured keys (Supabase URL/anon/service-role, `SCOUT_DB`), all non-blank. Values not read or printed (per data-handling policy — no secrets/credentials are reproduced in this or any hardening doc).

## AI Provider / Runtime Configuration

- Runtime: "AI Runtime V3" (`src/lib/ai/runtime/index.ts`), single `generate()` entry point with health-aware routing + circuit breaker.
- Providers configured: Groq, OpenCode Go (glm-5.3-flash, qwen3.8-flash, kimi-k3, longcat-2.0), OpenAI, LongCat. Fireworks and DeepSeek present in env template but DeepSeek gated behind `SCOUT_DEEPSEEK_ENABLED` (currently unset/0 per example).
- Task classes: `FAST_STRUCTURED`, `INTERACTIVE_WRITING`, `DEEP_WRITING`, `BACKGROUND_INTELLIGENCE`, each with a defined provider fallback chain (documented in `AI_RUNTIME_V3_STATUS.md`).
- **Known pre-existing gap** (self-documented, not discovered by this sprint): per `AI_RUNTIME_V3_STATUS.md`, of 36 total AI call sites, only the extraction pipeline is confirmed migrated onto the V3 runtime (via a compat layer). Draft/streamDraft and "all other library functions" are still noted as using the old call chain. **This is a direct Phase 15/16 target** — inconsistent AI call paths are a plausible root cause of non-deterministic behavior since old and new chains may have different temperature/schema/retry semantics.
- Telemetry: `ai_traces` table (migration `20260920000000_add_ai_traces.sql`), admin dashboard at `/admin/ai-usage`.

## Feature Flags (env-gated, as found in source — not exhaustive, will expand during Phase 1 system map)

- `SCOUT_DEEPSEEK_ENABLED` (`src/lib/ai/config.ts`) — gates DeepSeek provider tier.
- `SCOUT_GENOME_AI` (`src/lib/content/intelligence/genome.ts`) — gates AI-based vs. deterministic genome scoring; default is deterministic (no model call) per `.env.local.example` comment.
- `SCOUT_DAILY_SEND_LIMIT` — caps daily outbound sends (accountability-relevant, not a boolean flag).
- `CRON_SECRET` — auth gate for cron endpoints, not a feature toggle.

## Known Issues Carried Forward (not to be re-litigated as "caused by this sprint")

- The 12 failing unit tests listed above.
- The 36-call-site AI runtime migration gap.
- Prior BUG_LEDGER P1 items not yet marked fixed/verified: P1-02 (in-memory rate limiting won't work on serverless/Vercel — real correctness risk under Phase 47/54), P2-01 (misleadingly named `sanitizeContentCaption`, cosmetic).
- REL-FUNC-003/004 from a previous hardening round are marked "✅ Fixed (pending full role QA)" — full auth-role sweep across dedupe/duplicate-lead paths was left incomplete; picking this up fits Phase 21 (authorization attack matrix).

## Environment Limitations

- No live deployed environment verified as part of Phase 0 (E2E requires `next dev` + Supabase; will spin up per-feature rather than for this baseline check).
- Vercel CLI in this environment is outdated (59.23.2 → 59.25.0) and the Vercel MCP connector is unauthenticated — deployment-related tooling via Vercel MCP is unavailable until the user re-authorizes it. Not currently a blocker since hardening work is local-repo-first (Phase 0-2 don't require live deploys).
- This session runs in "auto mode" with a broader autonomy grant, but destructive production operations (running `scripts/_set-owner-admin-roles.mjs`, force-pushing, irreversible migrations, real external sends) remain out of bounds without separate explicit confirmation, per both the sprint brief's own Phase 76 exceptions and standing org policy.

## Next Step

Proceeding to Phase 1 (Architecture Inventory / `RELAY_SYSTEM_MAP.md`) and Phase 2 (Sources-of-Truth audit) per the Day 1 plan, focusing first on Lead Intelligence / scoring given the pre-existing test failures and partial canonical-intelligence migration found above.

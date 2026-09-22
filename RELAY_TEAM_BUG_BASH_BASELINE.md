# Relay Team Bug Bash — Freeze Baseline

Recorded: 2026-09-22

## Baseline

- **SHA**: `a301371e6f6c369b6613feca82c1e5dbd81e5fb0`
- **Branch**: `main`
- **Working tree**: clean (no uncommitted changes at freeze time)
- Note: `main` is 6 commits ahead of `origin/main` as of this freeze (Phase 0 baseline through the messaging-policy fix from the prior hardening sprint work this session) — not yet pushed; user has `git push` under explicit-approval gating in this session, has not yet approved the push.

## Test Suite

- `npx tsc --noEmit`: **PASS**, 0 errors.
- `npx vitest run`: **864 passed / 9 failed** (873 total, 57 files, 53 passed / 4 failed).
- `npm run build`: **PASS**.

### Pre-existing failing tests (carried forward from all prior baselines this session — NOT attributable to this bug-bash pass)

1. `tests/bd-draft-quality.test.ts` — "includes the signal evidence"
2. `tests/bd-pipeline.test.ts` — "drafts and sanitizes real outreach for a send-verdict lead"
3. `tests/forge-premium.test.ts` (4 failures) — visual concept, structure selection, stock-imagery check, evaluation scores
4. `tests/revenue-intelligence-insights.test.ts` (3 failures) — severity classification / funnel-ordering

These were present at the very first Phase 0 baseline of this session (`RELAY_HARDENING_BASELINE.md`) and have not been touched or worsened by any commit since. Confirmed by diffing failure lists across every baseline run this session — identical set each time.

## Environment Limitations (carried forward, still true)

- **No AI provider credentials configured** in this sandbox (`GROQ_API_KEY`, `OPENCODE`, `OPENAI_API_KEY`, `LONGCAT_API_KEY` all unset). Any finding that depends on live-LLM output (TEAM-005's determinism claim, TEAM-006's AI generation trace) will be root-caused and fixed architecturally against the real pipeline code, and verified via the deterministic fallback path + unit/integration tests — but NOT proven against a live provider. This is stated explicitly per-issue below, not glossed over.
- **No visual browser-driving tool** available to me directly (no screenshot/navigate capability). I DO have Playwright installed and can run the real `.spec.ts` E2E suite headlessly against a real Chromium instance and the real app — this is genuine browser acceptance (actual DOM, actual network calls, actual app code), just without a human-visible screenshot. Running these against the currently-live dev server (which is the user's own active session) needs their go-ahead before I drive real mutations through it, per this session's earlier agreement.
- **Input-hash reuse migration (`20260926000000_intelligence_input_hash.sql`) is written but not yet applied to the live database.** TEAM-005 depends on this — flagged, not silently assumed applied.
- `git push` requires explicit user action or a permission grant in this session (hit and confirmed earlier this session).

## Known Prior Findings Directly Relevant to This Pass

From this session's earlier hardening work (all already committed, SHAs above):
- REL-FUNC-005: Lead Detail was independently recomputing a legacy score instead of reading canonical — fixed.
- REL-FUNC-006 through 009: deterministic-extraction bugs (clinician false-positive, hiring-signal detection, location regex, fixture typo) — fixed.
- Input-hash reuse architecture built (Phase 6) — NOT yet applied to live DB.
- Daria Redkina/Solsonic fixture: company extraction, evidence-vs-inference wording, email prepare/send decoupling, empty-draft crash, cross-surface messaging policy, `/12` display bug — all fixed.

TEAM-002 (score inconsistency), TEAM-004 (summary/detail disagreement), TEAM-005 (score changes on reanalysis), and TEAM-010 (email prepare without verified contact) overlap substantially with this prior work — will audit whether they are the same root causes already fixed, newly-discovered separate instances, or genuinely new gaps, rather than assume either way.

## E2E Browser Acceptance — `e2e/smoke.spec.ts` (real Playwright + real Supabase-backed dev server)

Ran 3 full runs against `localhost:3000` (real Supabase credentials, not demo mode) after fixing the login helper (see below). Result across all 3 runs: **0 hard failures, 7/7 tests eventually green every time** — some tests needed Playwright's built-in retry (`retries: 1`), and which specific test needed a retry **varied between runs** (S04 flaked in run 2, passed clean in run 3; S05 and S07 flaked in run 3, passed clean in run 2).

**Classification (per explicit instruction — distinguish real bugs from test/environment issues, don't just widen windows):**
- **Legitimate cold-start / server-readiness (fixed in E2E infra)**: Turbopack dev-mode lazily compiles each route on first request — the very first test hitting `/login`/`/dashboard` in a fresh run can take several seconds longer than subsequent (already-compiled) hits. Not present in production (pre-built bundles, no compile step).
- **Test-harness hydration race (fixed in E2E infra)**: the original login helper used Playwright's `fill()` immediately after `page.goto(..., { waitUntil: 'domcontentloaded' })`. `domcontentloaded` fires before React hydrates; `fill()` sets the raw DOM value directly regardless of hydration state, so React's controlled-input state never updated and the submit button stayed disabled indefinitely — confirmed via a captured accessibility-tree snapshot showing both fields correctly filled but the button still `disabled`. Fixed: wait for `networkidle`, use real keystroke simulation (`pressSequentially`), and verify the controlled-input value before checking enabled.
- **Session-cookie propagation (fixed in E2E infra, not a code defect)**: after a successful `signInWithPassword`, a subsequent server-rendered page can occasionally still read no session, bouncing back to `/login`. The app's own `login-experience.tsx` already has a `waitForServerSession()` retry loop for exactly this gap; the E2E helper now mirrors it with a wider window. Investigated whether this indicates a real app bug (checked cookie `secure`/`sameSite` config — correct for non-HTTPS localhost; checked `getCurrentUser()` for cross-request caching — none, request-scoped only) — found no code defect, and the failure pattern (different test flakes each run, always resolves on Playwright's built-in retry, correlates with rapid sequential real-auth logins against a live backend) is consistent with genuine backend/network timing noise, not a deterministic product bug. **Not classified as a product bug — no code fix applied beyond the E2E-side wait.** If this recurs with a *consistent, single* failing step rather than a rotating one, revisit this conclusion.
- **Application state bug (would be fixed as a product bug, not by widening a wait)**: none found in this suite. No test failure traced to a genuine client or server logic defect — every failure traced to one of the three categories above.

`S01` (demo-mode-only assumption) is now environment-aware: skips with an explicit reason against a real-auth server instead of failing, rather than either deleting the test or leaving it permanently red.

## Next Step

Adding TEAM-001 through TEAM-010 to `BUG_LEDGER.md` with stable IDs, then reproducing/root-causing each one against the real code before any fix, per the bug-bash brief.

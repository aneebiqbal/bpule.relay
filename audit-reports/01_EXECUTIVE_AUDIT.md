# RELAY + STUDIO — EXECUTIVE AUDIT

**Audit Date:** 2026-09-29
**Scope:** Full end-to-end audit of Relay + Studio application
**Method:** System map → Code analysis → Architecture review → Cross-layer invariant testing
**Baseline:** TypeScript PASS, 1418/1418 unit/integration tests PASS, build PASS

---

## RELEASE READINESS: NOT READY

**P0 (Critical):** 8 new + 2 pre-existing = **10 total**
**P1 (High):** 14 new + 4 pre-existing = **18 total**
**P2 (Medium):** 22 new + 3 pre-existing = **25 total**
**P3 (Low):** 8 new = **8 total**

---

## BIGGEST ARCHITECTURAL RISKS

1. **Two co-existing AI routing systems** — Runtime V3 (`src/lib/ai/runtime/`) and legacy chain router (`src/lib/ai/routing.ts`) run simultaneously. The legacy path is still used by the draft pipeline and calibration. This creates inconsistent model selection, cost tracking, and quality behavior depending on which path a request takes.

2. **Voice/Style is per-rep, not per-profile** — A rep with multiple revenue identities (e.g., LinkedIn persona + Upwork persona) always uses the same voice card regardless of which profile is selected. Persona switching changes proof matching but NOT voice, creating an inconsistent product experience.

3. **Evidence fabrication pipeline** — The intelligence system systematically replaces the AI's honest "I don't know" with invented needs, triggers, and buyer-intent evidence. Scoring dimensions are fed back into the evidence ledger as if they were real facts. A prospect with zero buying signals still scores ~31/100 due to accumulated baselines.

4. **Session refresh broken in RSC** — When Supabase refreshes a near-expired session during React Server Component rendering, the cookie write fails silently. Users experience unexpected 401s until full page reload.

5. **No database-level tenant isolation fallback** — `current_org_id()` does not exist. All security relies on application-layer enforcement + correct RLS. Several store methods lack org_id filters entirely.

---

## BIGGEST PRODUCT BLOCKERS

| # | Blocker | Impact |
|---|---------|--------|
| 1 | Studio onboarding never creates a voice profile → infinite redirect loop | Users who complete Studio onboarding without Relay onboarding are stuck |
| 2 | `/admin` route has loading.tsx but no page.tsx | Admin 404s on direct access |
| 3 | `/conversations` is an orphan route — sidebar points to `/relay` | Full conversation workspace unreachable |
| 4 | Conversation copilot ignores calibrated voice card | Replies don't match outbound voice |
| 5 | No connection rejection/timeout state in relationship state machine | Leads stuck in "Waiting for connection" forever |
| 6 | `/api/onboarding/complete` is orphaned dead code | Organization facts/plays never replaced from template |
| 7 | Admin Command Center reads from empty `day_closes` system | Shows all-zero stats despite active team |
| 8 | `timing-engine.ts` is decorative scaffolding with zero UI consumers | DM gating, follow-up cooldown not enforced by design |

---

## BIGGEST AI RISKS

1. **Fabricated evidence** — `buildFallbackProbableNeed`, `buildFallbackTrigger`, and `buildScoringEvidence` invent buyer-intent statements with no grounding. The AI's null/uncertain outputs are systematically overridden.

2. **Score floor inflation** — ~31-point baseline across dimensions means every pasted profile scores 31-40 even with zero evidence. This makes the score meaningless for qualification decisions.

3. **Forge winner duplication** — When one candidate passes immediately, the forge returns the winner's content in both candidate slots, corrupting the best-of-two architecture.

4. **Taste profile half-wired** — `shortVsDeep` dimension is never learned. Taste only affects idea discovery, not generation. v1 `generate-draft` ignores taste entirely.

5. **Persona context not isolated in forge** — Flat input bag with no runtime guard against cross-persona contamination.

---

## BIGGEST SECURITY RISKS

| # | Risk | Severity |
|---|------|----------|
| 1 | Stale `reps.role` overrides `organization_roles` table — demoted users retain admin access | P0 |
| 2 | No session revocation after account deletion — deleted users' cookies remain valid | P0 |
| 3 | Rate limiter fails open on DB errors — unlimited signups during any DB issue | P0 |
| 4 | Session refresh silently fails in RSC — users logged out unexpectedly | P1 |
| 5 | Service role key in public signup endpoint — RLS fully bypassed for user creation | P1 |
| 6 | Several store methods lack org_id filter — cross-org data leakage if RLS misconfigured | P1 |
| 7 | Login 1.2s timeout too aggressive — false "cookie blocked" errors on slow networks | P1 |

---

## BIGGEST UX/NAVIGATION PROBLEMS

1. **Orphan routes** — `/conversations`, `/activate`, `/manage-profiles`, `/resume/generate`, `/revenue/email`, `/workspace/[id]`, `/admin/ai-usage`, `/admin/growth` have no navigation entry point
2. **Dead anchor links** — Landing nav links to `/#moves`, `/#studio`, `/#team`, `/#how-it-works` — these section IDs don't exist in the landing page component
3. **`/admin` missing page** — Has loading.tsx but no page.tsx
4. **Profile selector resets** — `sender_profile_id` stored on lead but never used to pre-select profile in UI
5. **Disabled tabs are no-ops** — Clicking disabled Follow-up/Reply tabs gives zero feedback (partially fixed in TEAM-007)

---

## WHAT WORKS (Verified)

- TypeScript: clean
- Build: succeeds
- 1418 unit/integration tests: pass
- Lead extraction pipeline (deterministic path): functional
- Canonical scoring with input-hash reuse: functional
- Email Outreach V1 (prepare → send → webhook → reply lifecycle): PASS
- Lead connection acceptance flow: functional
- Log sent idempotency (with concurrency fix): functional
- Prospect qualification gate: functional
- Lead dedupe guard: functional
- Multi-tenant RLS (tested via adversarial scripts): functional for core tables
- Content persona creation and draft generation: functional
- Accountability tracking (daily_targets/daily_accountability): functional

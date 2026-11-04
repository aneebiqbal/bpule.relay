# Relay — 10-Day Complete Product / Intelligence / UX / Revenue Audit

**Date:** 2026-10-24 · **Repo:** `/Users/mac/Desktop/products/scout` · **HEAD at audit start:** `eb3c82c` (branch `main`)
**Live data:** Supabase project `fhnkanwvgamitrcuzpem` (read-only queries; no writes)
**Prior audit:** `docs/RELAY_E2E_AUDIT_2026-10-22.md` + `docs/qa-closure/` (RQA-001→048)

> **Coverage honesty:** this pass re-used and re-verified the prior audit's findings, ran fresh source + live-data analysis, and ran typecheck + the full test suite. **Browser/device verification was NOT run** (no running app / deployed-SHA parity in this environment), so every UI claim below is marked *source-derived* unless a prior browser row exists. Nothing here is claimed browser-fixed.

---

## 1. Executive summary

Relay is a genuinely ambitious, unusually well-instrumented sales-intelligence product. The architecture is sound where it matters most: scoring is pure arithmetic over a canonical `SourceFacts` packet; the buyer-intent authority is single-source; routing is deterministic; there are real migrations for multi-tenancy, idempotency, shadow scoring and dataset governance. The engineering culture (version tags, reuse keys, guards, shadow mode) is senior-grade.

It is **not production-ready**, for reasons that are mostly *not* the scoring model:

1. **Wrong numbers are shown to reps and admins as if they were true.** `leads` has no `updated_at`, yet accountability and revenue-intelligence query it. The errors are swallowed, so dashboards render **plausible zeros** instead of failing: 3 real wins show as **0**; the rep's "Needs your reply / Follow-up due" queues are always empty; the entire Revenue Intelligence page is zeros. (P0 — fixed in this pass.)
2. **Cross-tenant data exposure.** `intelligence_sample_events` had RLS policies written but **RLS never enabled** — any authenticated user could read every tenant's message text and client replies. (P0 — fixed in this pass.)
3. **Raw production PII is committed to git**: 39 files / 41 MB under `audit-reports/historical-intelligence/`, including 161 real email addresses and LinkedIn URLs, and **not gitignored**. This is the single worst finding; it needs a history rewrite and credential rotation (P0 — **not** auto-fixed, destructive).
4. **Message quality is the weakest link for actually closing business.** ~15% of real messages are BAD, ≥3 confirmed FABRICATED (invented employer history, invented estimates, false network claims), 24/96 Upwork drafts contain stripped-number artifacts (`"improved engagement by %."`), and the identity/claim guard is **dead code**. ~10% are MARKETING_NOT_SALES.
5. **Follow-up policy has three contradictory implementations** (DB trigger = 5 business days / 1 follow-up; `leads/followup.ts` = 3/6/6 calendar days / 3 follow-ups; `relay/timing-engine.ts` = 24 h) and **opt-out is not recognised** — "do not send any additional sales messages or follow-ups" classifies NEUTRAL and a follow-up is allowed.
6. **Score collapse is real and worse than documented**: 78% of scored leads land in MAYBE, 0% SKIP, and a small services shop is indistinguishable from a Series-A CTO. This is the known V4 diagnosis, still unfixed in production.
7. **Authorization gaps**: `/api/admin/performance` and `/api/admin/rep-performance` were auth-only (any rep could read any rep's performance via `?repId=`); the command palette shows admin commands to every role. (P1 — fixed in this pass.)

---

## 2. Product health score

| Dimension | Score /10 | Basis |
|---|---|---|
| Architecture & data model | **7.5** | Clean canonical layers, versions, RLS, idempotency. Loses points for 3 parallel scoring engines, 3 follow-up clocks, duplicate `calculateContactWindow`. |
| Intelligence correctness | **5.0** | Buyer/role precision good on fixtures; real-data misclassifications (hiring read as buying); score collapse; 31% stale score packets. |
| Scoring trust | **4.5** | 78% MAYBE, 0% SKIP, non-monotone commercial potential; shadow engines disagree materially and routing v2 is unwired. |
| Messaging | **3.5** | ~15% BAD, ≥3 fabricated, identity guard dead, generic openers dominate, sender id never persisted. |
| Routing | **6.5** | Deterministic and explainable; v1 live, v2 audit-only, `proof_items` = 0 blocks proof-backed routing. |
| UX | **5.5** | Consistent design tokens and a real design system, but many duplicate/dead pages, layout-only auth on 23 pages, mobile nav trap unresolved. |
| Numbers / analytics | **3.0** | Multiple metrics silently zero or untraceable; AI cost always $0; accountability N+1 (252 queries). |
| Security | **4.0** | Org scoping is strong by construction; but committed PII, one missing RLS, and open admin routes. |
| Test/reliability | **6.0** | 3,054 pass; 8 pre-existing failures in identity extraction and conversation turn-taking. |
| **Overall** | **5.0** | **CONDITIONAL** — trustworthy data plumbing, untrustworthy surface. |

---

## 3. Page-by-page audit

Scores are **source-derived** (structure, gating, data flow). *No browser run this pass.* `K`=keep, `F`=fix, `R`=redesign, `M`=merge, `X`=remove.

| Page | Role | UI | Fn | Sales | Issues | Action |
|---|---|---|---|---|---|---|
| `/login` `/signup` `/forgot-password` | public | 7 | 7 | — | Standard; contrast unverified | K/F |
| `/dashboard` (Today) | all | 6 | 4 | 7 | Rep view OK; admin `AdminDashboard` depends on broken metrics; analytics chart silently null | F |
| `/leads` | rep+ | 6 | 6 | 8 | Uses `LeadsBoardV2`; `leads-board.tsx`/`leads-tab-view.tsx`/`leads-pipeline.tsx` are dead | F/X |
| `/leads/new` `/leads/import` | rep+ | 6 | 7 | 7 | Manual-create path OK | K |
| `/leads/[id]` | rep+ | 7 | 6 | 9 | Rich; mixed `/10` vs `/12` scale on legacy rows; sender card added | F |
| `/prospect` | rep+ | 7 | 6 | 9 | Analyze + sender switch; persistence verified only via prior localStorage fix | K |
| `/chats` | rep+ | 6 | 5 | 7 | Queue; thread-integrity risk (unrelated inbound merged) | F |
| `/conversations` | — | — | — | — | **Dead** (0 refs) | X |
| `/inbound` | rep+ | 6 | 6 | 7 | Signature parsing fixed; reply intent weak | F |
| `/relay` (Conversations) | rep+ | 6 | 5 | 7 | Overlaps `/chats` | M |
| `/upwork` `/upwork/new` `/upwork/[id]` | rep+ | 6 | 6 | 8 | Proposal quality issues (`%` artifacts, invented estimates) | F |
| `/performance` `/accountability` | rep | 5 | 3 | 5 | Wins always 0; queues empty (P0) | F |
| `/team` `/team/[repId]` `/team/eval` | manager/admin | 6 | 5 | 6 | Manager view present | K |
| `/content` (+ 7 sub-routes) | rep+ | 7 | 6 | 5 | Studio is a content app, not sales; high complexity | R/M |
| `/content-v2/growth` | admin | 6 | 5 | 4 | Admin-only growth surface; low revenue value | R |
| `/profile-intelligence` `/profiles` `/manage-profiles` | rep+ | 6 | 5 | 6 | `proof_items` = 0; enrichment queue | F |
| `/facts` | rep+ | 6 | 6 | 6 | Proof manager | K |
| `/archive` | rep+ | 6 | 6 | 5 | Archive/restore works | K |
| `/settings` `/account` | all | 6 | 6 | 4 | Voice calibration route unverified | K |
| `/admin/command-center` | admin | 6 | 4 | 6 | Wins hardcoded 0; opportunities double-count | F |
| `/admin/accountability` | admin | 5 | 2 | 5 | N+1 (252 q); zeros | F |
| `/admin/ai-usage` | admin | 6 | 4 | 4 | Cost always $0; truncates at 1000 | F |
| `/admin/dataset` | admin | 5 | 5 | 4 | Export redaction good; includes test rows | F |
| `/admin/training-data` | admin | 6 | 4 | 4 | 0 human labels; pipeline functional | F |
| `/admin/scoring-qa` | admin | 6 | 6 | 6 | Best-in-class surface | K |
| `/admin/revenue-intelligence` | admin | 5 | 2 | 5 | All zeros (P0) | F |
| `/admin/people` `/targets` `/activity` | admin | 6 | 5 | 5 | `activity` gated correctly | K |
| `/admin/performance` `/rep-performance` (API) | admin | — | 3 | — | Auth-only IDOR (P1) | F |
| `/admin` `/admin/growth` `/usage` `/find-jobs` `/resume/generate` `/studio/drafts/new` `/relay/persona-daily` | — | — | — | — | **Dead/unreachable** | X |
| `/revenue/email` `/workspace/[id]` | rep+ | 6 | 5 | 6 | Revenue loop surfaces | K |
| `/usage` | rep | 5 | 5 | 3 | Low value | M |

---

## 4. Role audit

| Role | Pages | Data scope | Gaps |
|---|---|---|---|
| **OWNER** | all + 12 admin | org-wide | — |
| **ADMIN** | all + 12 admin | org-wide | `reps.role` used as nav fallback (`app-rail`), never for authorization (correct) |
| **MANAGER** | team pages | managed teams | `/api/admin/performance` readable pre-fix |
| **MEMBER/REP** | rep surfaces | own + team-visible | Could read any rep's performance via `?repId=` (fixed); command palette shows admin commands |
| **SOURCER** | rep surfaces | own | No distinct permissions |

**Cross-org denial works.** `organization_roles` overrides stale `reps.role`. `getCurrentUser` → `getClaims()` with `getUser()` fallback. The 12 admin pages are independently gated server-side; 23 `(app)` pages are **layout-auth-only** (any authed user can reach them).

---

## 5. Lead / prospect intelligence audit

Pipeline verified: raw → `normalizeProspectPaste` → `readSourceFacts` → events → evidence episodes → bounded decision → `scoreEpisode` → `qualifyCanonicalScore` → action → routing.

**What works:** single buyer-intent authority; model answers clamped to source facts; `rejectedSignals` recorded; evidence quality deterministic; no fabricated evidence found in the dimension math; NaN/division guards present.

**Real-data defects:**

- **P1 — hiring misread as buying.** `source-facts.ts:54-58,336`: `"Slalom is expanding, and we're looking for a Salesforce Developer ready to make an impact."` → `DEVELOPER_REQUEST` fires, `INTERNAL_HIRING_CONTEXT` does not → `BUYER_AND_SELLER`, `HIGH`, `verifiedBuyerRequest=true`, score 68, `send`. Expected: employment hiring → not a buyer request. Fix: `HIRING_ROLE_NOUN` guard before `DEVELOPER_REQUEST`.
- **P1 — 25/393 leads have no canonical score but a legacy 0–12 `score`** (e.g. Wizards of the Coast legacy 11, `verdict=send`). They render `/12` beside canonical `/10` rings.
- **P1 — 121/393 leads (31%) carry a stale `score_version`** (73 on v3.2.0, 48 on v3.1.0, current v3.3.0 on 246). Stored packets are recomputed on open, so the displayed score can lag.
- **P2 — `score-v3.ts:302` takes `verbatimCount` from the caller**; a caller passing `[]` silently downgrades verbatim evidence to 0.2.
- **P2 — `dimensions.ts:485` `ownership` is a constant** keyed on role, not a verifiable source line.

**Score collapse (live):** MAYBE 35–54 = **78.3%**, WORTH_PURSUING 9.5%, STRONG 3.5%, LOW 8.7%, **SKIP 0.0%**. With unknown intent, buyer intent is capped, so the whole profile lives in six bounded dims → 45–54. Commercial potential is **non-monotone** in the display band (highest at 6/10). A real 8-person shop and a Series-A CTO are indistinguishable.

---

## 6. Scoring / ranking audit

| Engine | Enabled | Action accuracy | Confidence ECE | Notes |
|---|---|---|---|---|
| `v3` (production) | yes | 1.00 by construction | **0.457** | least calibrated |
| `calibrated_v4` | shadow | 0.94 | 0.320 | |
| `ordinal_logit` | shadow | 1.00 | **0.230** | best calibrated |
| `gbdt_pairwise` | shadow | 0.79 | 0.224 | |
| `knn_features` | shadow | 0.99 | 0.357 | |

- **Shadow engines are enabled and populated**: 717 rows each, 2,868 total. Candidates disagree materially (`MAYBE→LOW` 226, `WP→STRONG` 61). **Promotion gate unmet: `scoring_labels` = 0 rows.**
- **Routing v2 is audit-only.** `compareRouting` is called only from `scoring-v4/shadow.ts:88`; production uses `routing_v1`.
- **Second scorer leaks.** `api/prospect/save/route.ts:193,221` still writes `lib/score/rubric` `computeScore` (0–12) to `leads.score` with `scoreVersion='relay_decision_v3.0.0'`.
- **Parallel threshold tables** at `relay/signal-watch.ts:80-236`, `leads/leads-pipeline.tsx:57-59`, `intelligence-v3/action/recommended-action.ts:102`, `ai/draft.ts:452`, `prospect/intelligence.ts:128`, `intelligence-v2/scoring-engine.ts:316-319`, `score/rubric.ts:42`.
- **Docs are stale**: `SCORING_ARCHITECTURE.md` says v3.2.0 / `action_policy_v1`; code is v3.3.0 / `action_policy_v2`.

**Verdict: IMPROVED BUT NOT STABLE.** The model is not the bottleneck; extraction is. Do not promote any candidate without human labels.

---

## 7. Routing audit

`rankSendersForLead` is deterministic, explainable, and correct in design (capability overlap, industry, proof, platform fit, bounded history). Guarantees hold: sender change never changes the score; cached packets are sender-independent.

**Defects:**
- **P1 — `proof_items` = 0 rows** while `proof_cards` = 39. Proof-backed routing cannot actually fire; `primaryProof` is effectively always null. This is the prerequisite for routing v2.
- **P1 — `messages.sender_profile_id` is NULL on all 529 rows.** `markContacted.insertPayload` (`supabase-store.ts:1251-1262`) selects `sender_profile_id` at `:1223` but never persists it; `recordProspectReply:1586` omits it too. Sender identity is unauditable; sign-offs are model-chosen (msg `87fec5e1` signed "Mehak" under Aneeb's profile).
- **P2 — `relay/historical-outcomes` is bounded but unused in production ranking** (16 replies, 2 wins → Bayesian-smoothed to prior, marked unreliable). No causal claims possible.
- **P2 — `/api/admin/routing-opportunities` is auth-only** (any rep can list org-wide routing mismatches).
- **P2 — routing history not captured** at save (placeholder `profileMatch 0`).

---

## 8. Message quality audit (50+ real messages read)

Classification of ~200 messages read verbatim: **PASS ~35%, WEAK ~40%, BAD ~15%, FABRICATED ≥3, MARKETING_NOT_SALES ~10%.**

**Top recurring failures:**
1. **Generic AI-template openers** (39+ exact hits): `"Hey Jiri, I see you have a strong focus on improving operations at Oracle. What specific challenges are you currently facing in that area?"` — from `draft-stream.ts:343-395`. All set `passed=false` but **still render**.
2. **Fabricated employer history** (msg `f7afea0b`): `"At aquasec.com I worked on cloud security data flows… At deepidv.com I built compliance workflows covering KYC and AML…"` — on a sender profile with **no** company/skills. FABRICATED.
3. **Stripped-number artifacts**: `"…improved engagement by %."` in **24/96 Upwork drafts**; `"your ‑month free trial with / support"`. `hasUnfilledValues` returns false for `"by %."`.
4. **Invented estimate + false network claim** (msg `bf05eade`): `"generally 4-6 weeks. I haven't worked directly with Stripe yet, but I can connect you with experts who have."`
5. **Sign-off mismatch** (msg `87fec5e1`): `"Best, Mehak"` on Aneeb's profile.

**Groundedness bypasses (the important part):**
- `stripUnauthorizedNumbers` (`facts/sanitize.ts:80-100`) is **non-blocking** — it flags `strippedNumbers` but the draft ships.
- `composer.unsupportedClaims`/`CLAIM_LEAD` (`conversation/composer.ts:203-220`) only matches **capitalized** names → lowercase fabricated domains pass.
- `relay/hallucination-guard.ts:58` is **dead code** (never imported).
- Call asks survive: `"Can we do a 15-minute call Thursday"` not matched by `CALL_REQUEST_RE`.

**Verdict: NEEDS IMPROVEMENT** — leaning NOT SALES READY. A real rep would lose trust within a week.

---

## 9. Follow-up audit

| Check | Result |
|---|---|
| No follow-up after reply | ✅ (`outcomes.stage='replied'` + status `replied`) |
| No follow-up after Won/Lost | ⚠️ queue excludes them; `markContacted` has **no won/lost check** |
| No follow-up after opt-out | ❌ **P0** — "do not send any additional sales messages or follow-ups" → NEUTRAL |
| No duplicate follow-up | ✅ (≥3 calendar days since last outbound) |
| Correct business-day timing | ❌ **three contradictory clocks** |
| Deferred prospects | ⚠️ declined leads still queued until send-time gate |

**Three clocks:**
- DB trigger `0033`: **5 business days**, **1 follow-up ever**.
- `leads/followup.ts`: **3/6/6 calendar days**, **3 follow-ups**.
- `relay/timing-engine.ts`: **24 h** follow-up window.

`conversation_states.next_followup_at` is a **dead column** (never set). Timing is recomputed on read.

**P0 fix:** add STOP patterns ("do not send…", "no further…") and treat `internally/ourselves` as negative in `conversation/intent.ts`; wire outcomes/status into `determineFollowup` and `fetchFollowupsDue`.

---

## 10. Conversation audit

| Inbound (real) | Assigned | Expected |
|---|---|---|
| "Do not send any additional sales messages or follow-ups." | NEUTRAL | NEGATIVE / DO_NOT_CONTACT (**P0**) |
| "We are developers, we are not hiring" | NEUTRAL | NEGATIVE |
| "yes youre hired please sign nda for me" | NEUTRAL | POSITIVE buying signal |
| "my budget is arround 30000$" | NEUTRAL | pricing/budget |
| asks pricing **and** "discovery call this Thursday" | pricing | meeting |

- No `procurement` intent exists; stated budget is never stored (`extractConversationFacts`).
- **Live conversation overrides cold score for action, never score** — correct.
- **P2 thread integrity:** lead "Autodesk Research / Pete Meltzer" contains inbound messages from unrelated prospects; `recordProspectReply` trusts the URL lead id with no prospect match.
- **P1 prompt injection:** client text inserted raw into prompts with no delimiter (`composer.ts:177-179`, `draft/route.ts:236,262`).

---

## 11. Daily BD workflow audit

`login → Today → inspect → analyze → save → sender → contact → log send → reply → follow-up → refer → help → won/lost → archive` — the loop is **structurally complete** and the queue engine is genuinely good (role-filtered, canonical `rankNextActions`, live override).

**Breaks:**
- **Today's "Won" and the three open-lead queues are always empty** (P0, fixed).
- **Follow-up due timing contradicts the DB trigger**; a rep can be told a follow-up is due while the DB says not.
- **"Refresh Signals" 404s** (selects `leads.updated_at`) — P0, fixed.
- **Help requests = 0 rows** despite `/api/leads/[id]/help` existing; `help_requests` table empty.
- **Referrals = 1**; `profile_opportunity_matches` = 0.
- `resumeWork` derives from `messages[].draftText`, but `draft_text` is **always null** (173/371 connections have empty `sent_text`) → resume work is effectively dead.
- Daily send ceiling exists (`SCOUT_DAILY_SEND_LIMIT`) and is enforced in the rail; good.

---

## 12. Admin / management audit

**P0 (fixed):**
1. **Accountability wins + open-lead queues always empty** — `metrics.ts:96-102,167-176` query `leads.updated_at`.
2. **Revenue Intelligence all zeros** — `api/admin/revenue-intelligence/route.ts:58` selects `updated_at`.

**P1:**
3. **AI cost always $0** — 2,978 traces, all `estimated_cost_usd=0`; `recordScopedTrace` never passes cost (`telemetry.ts:153`).
4. **AI usage truncates at 1000** (`.limit(20000)` → PostgREST max 1000).
5. **Command center reports `wins: 0`** and double-counts `CLIENT_WON` as an opportunity (`command-center-v2.ts:561,600,340`).
6. **Observability "orphaned" metrics are meaningless** (`observability.ts:93-104`).
7. **Dataset "Msg Pairs" always 0** + cross-org count (`dataset/metrics.ts:44-58`) — fixed the count; org scoping now via RLS.
8. **team-live payload unbounded** (`load-team-live.ts:27-29`).
9. **Accountability N+1**: 18 reps × 7 days × 2 = **252 queries** per load (`metrics.ts:240-256`).
10. **scoring-integrity heuristics** use row counts, not distinct; `labelCoverage` returns an absolute count; endpoint unconsumed.

**Traceable (verified):** pipeline-analytics stage/funnel/score bands; `activity-model` wins = `CLIENT_WON` = 3 = `leads.status='won'`; scoring-qa dedupes by `opportunity_key` and excludes `is_test`.

**Data gaps (not code):** `day_closes`=0, `revenue_identity_contracts`=0, `scoring_labels`=0, `help_requests`=0.

---

## 13. Dataset audit

- 430 samples / 1,329 events; funnel stages: OUTCOME 111, ROUTING 18, RAW_INPUT 14, SCORE 4, EXTRACTION 2.
- **Label states:** AI_ONLY 133, UNLABELED 15, HUMAN_REVIEWED 1, TRAINING_APPROVED 0. **Zero human ground truth.**
- `intelligence_samples` is a mutable snapshot with growing arrays; `intelligence_sample_events` is the append-only stream (unique idempotency index now).
- **P2 — test data not excluded** from dataset surfaces (4 `is_test`/`E2E` samples included in samples/export/metrics). Gate exists only in `scoring-qa`.
- **P2 — any member can write samples / mark them training-eligible** (`dataset/capture` requires auth only).
- **P2 — no retention policy** for samples or shadow rows.

---

## 14. Security / RLS audit

| Finding | Severity | Status |
|---|---|---|
| **Raw production PII committed to git** (39 files, 41 MB, 161 emails, 118 LinkedIn URLs; not gitignored) | **P0** | **Open** — needs history rewrite + credential rotation |
| **`intelligence_sample_events` RLS never enabled** | **P0** | **Fixed** (migration `20261024120000`) |
| **Cross-org aggregate in dataset metrics** | P1 | **Fixed** (org filter + RLS) |
| **`/api/admin/performance`, `/api/admin/rep-performance` auth-only IDOR** | P1 | **Fixed** (`VIEW_TEAM_ANALYTICS`) |
| **`/api/admin/routing-opportunities` auth-only** | P2 | Open |
| **Duplicate migration versions** (`20261008000000`×3, `20261009000001`×2, `20261019000003`×2, `0090`×2, `0091`×2; gaps `0044→0078`) | P1 | Open |
| **SECURITY DEFINER RPCs with no tenant/reviewer check** (`append_sample_event`, `approve_sample_for_training`) | P1 | Open — unused by `src` but callable |
| **`performance_config` RLS trusts stale `reps.role`** | P2 | Open |
| **`admin/observability` trusts `x-org-id` header + cron secret** | P2 | Open |
| **Idempotency gaps**: 957/2,810 `action_events` NULL key; 2 exact dup `RECOMMENDATION_SHOWN`; 34/529 messages NULL key | P2 | Open |
| **`auth.getUser()` on the wrong client** | — | **Clean** (prior class fixed) |
| **Cross-org leakage in store/service-role routes** | — | **Clean** (org-scoped by construction) |
| **Dataset export redaction / HMAC anon ids** | — | **Solid** |

**Migration drift:** 125 files; duplicates above; manual `apply_observability_ddl.sql` outside the runner. No destructive migration proposed.

---

## 15. Performance audit

- **Accountability calendar: 252 queries** per admin load (N+1) — P1.
- **AI usage: 1000-row cap** — P1.
- **team-live: unbounded** message/lead/extraction payloads — P1.
- **org-command-snapshot: no date filter** on extraction counts → lifetime shown as today — P2.
- **`observability`: `.limit(1000)`** truncates fallback/lifecycle — P2.
- **Dashboard**: `loadRepWorkspaceData` issues ~8 sequential/parallel queries per rep; `countProfilesPulled` uses server time not org timezone — P2.
- **AI cost by feature**: 2,978 traces, all cost 0, so **cost-per-feature is unmeasurable** — P1.
- **No measured route load times** this pass (no running app).

---

## 16. Number / metric audit

| Metric | Source | Traceable? |
|---|---|---|
| Wins (accountability) | `leads.status='won'` + `outcomes` | ❌ was 0 → **fixed** |
| Open-lead queues | `leads` + `messages` | ❌ was empty → **fixed** |
| Revenue funnel | `relay_events` | ❌ all 0 → **fixed** |
| AI spend | `ai_traces.estimated_cost_usd` | ❌ always $0 → **P1** |
| AI call count | `ai_traces` | ⚠️ capped at 1000 |
| Dataset msg pairs | `intelligence_sample_events` | ❌ was 0 → **fixed** |
| Command-center wins | `CLIENT_WON` | ❌ hardcoded 0 → **P1** |
| Orphaned messages | `messages` | ❌ wrong definition → **P1** |
| Pipeline analytics | `leads` + `messages` | ✅ |
| Activity wins | `CLIENT_WON` | ✅ |
| Shadow coverage | row counts | ⚠️ not distinct |
| Label coverage | absolute count | ⚠️ not a ratio |

**Rule confirmed:** any number that cannot be traced to canonical data is a bug. Several were.

---

## 17. Dead code / unnecessary features

**Dead pages (0 refs):** `/find-jobs`, `/relay/persona-daily`, `/resume/generate`, `/studio/drafts/new`, `/admin/growth`, `/conversations`, `/usage`, `/content/growth`, `/admin` (stub), `/admin/revenue-identities` (stub), `/content/[id]` + sub-routes (redirect stubs).

**Dead components (no inbound import):** `leads-pipeline.tsx`, `leads-tab-view.tsx`, `public-nav.tsx`, `public-footer.tsx`, `account-settings.tsx`, `email-outreach-panel.tsx`, `generation-mode-selector.tsx`, `manager-team-view.tsx`, `admin-performance-overview.tsx`, `team-view.tsx`, `my-day-card.tsx`, `responsibility-card.tsx`, `rep-day-timeline.tsx`, plus 8 unused `ui/*` primitives.

**Dead lib modules:** `relay/hallucination-guard.ts`, `relay/objection-memory.ts`, `relay/message-eligibility.ts`, `conversation/intelligence-engine.ts`, `orchestration/next-action.ts`, `intelligence-v3/latent-opportunity.ts`, `scoring-v4/research-router.ts`, `intelligence-v2/index.ts`, `lib/demo-extract.ts`, `admin/org-command-snapshot.ts`.

**Superseded API families:** `content/intelligence/{discover,forge,interview,org-themes}` (v2 live); `growth/{decision,draft,memory,publications,today}` (0 refs); `profile-intelligence/legacy/classify`; `profiles/[id]/sources` (410).

**Duplicate engines:** `intelligence-v2` (12 files) vs `intelligence-v3` (23); `score/rubric` (0–12) vs `score-v3` (0–100); `lib/timezone/resolve.ts` `calculateContactWindow` vs `relay/timing-engine.ts`; `studio-v2` vs `content-v2`.

**Decision:** REMOVE the dead pages/components above; MERGE `content-v2`/`studio-v2` into one; KEEP `intelligence-v3` and delete `intelligence-v2` after confirming no live import; REDESIGN the Studio/content surfaces.

---

## 18. UI redesign opportunities

1. **Leads pipeline scale mismatch** — legacy `/12` vs canonical `/10` in the same list. Redesign to one scale (`getLeadDisplayScore`).
2. **Today's queue** — the highest-value screen; make the "next action" undeniable and the queues real.
3. **Lead detail** — strong; collapse the decision card / sender card / history into one coherent narrative.
4. **Admin accountability** — rebuild on correct data; fix N+1; show targets vs actuals without impossible percentages.
5. **Studio** — decide if it is a sales tool or a content app; currently it is the latter and adds the most complexity for the least revenue.

---

## 19. P0 issues

| ID | Area | Root cause | Fix | Status |
|---|---|---|---|---|
| P0-1 | Security | `intelligence_sample_events` RLS never enabled | Migration `20261024120000` (org column + trigger + RLS + policies) | **Fixed** |
| P0-2 | Data | `leads.updated_at` queried in accountability | Use `outcomes` (stage=won) + `created_at` | **Fixed** |
| P0-3 | Data | `leads.updated_at` queried in revenue-intelligence | Drop from select | **Fixed** |
| P0-4 | Function | `refresh-intelligence` selects `updated_at` → 404 | Use `scored_at ?? created_at` | **Fixed** |
| P0-5 | Security | Raw PII committed to git | `git rm` + history rewrite + credential rotation | **Open (team)** |
| P0-6 | Messaging | Opt-out classified NEUTRAL → follow-up allowed | Add STOP/REFUSAL patterns; wire outcomes into follow-up | **Open** |
| P0-7 | Messaging | Fabricated claims on empty profiles | Run `validateReply`; block lowercase claims | **Open** |

## 20. P1 issues

| ID | Area | Root cause | Fix |
|---|---|---|---|
| P1-1 | Numbers | AI cost always $0 | Compute from tokens + pricing in `recordScopedTrace` |
| P1-2 | Numbers | AI usage capped at 1000 | Paginate / aggregate |
| P1-3 | Numbers | Command-center wins hardcoded 0 | Count `CLIENT_WON` |
| P1-4 | Numbers | Observability orphan definition wrong | Join to `leads` |
| P1-5 | Perf | Accountability N+1 (252 q) | One grouped query |
| P1-6 | Security | `/api/admin/routing-opportunities` auth-only | Gate `VIEW_TEAM_ANALYTICS` |
| P1-7 | Migrations | Duplicate versions | Renumber |
| P1-8 | Security | SECURITY DEFINER RPCs unchecked | Add org/reviewer check or drop |
| P1-9 | Routing | `proof_items` = 0 | Backfill proof items |
| P1-10 | Messaging | `sender_profile_id` never persisted | Persist; enforce sign-off |
| P1-11 | Follow-up | Three contradictory clocks | One policy module |
| P1-12 | Intelligence | Hiring read as buying | `HIRING_ROLE_NOUN` guard |
| P1-13 | Intelligence | Stale score packets (31%) | Recompute on read is fine; surface staleness |
| P1-14 | Messaging | `hallucination-guard` dead | Wire into composer |
| P1-15 | Dataset | Test data included | Default-exclude `is_test` |
| P1-16 | Dataset | Any member can write samples | Require `canManage` |

## 21. P2 issues

Mixed `/12` scale; parallel threshold tables; `next_followup_at` dead; declined leads queued; won/lost send not blocked; thread integrity; prompt injection; `scheduledDaysRatio` hardcoded 0; `execution-score` `eligibleTarget=0` fallback; `engaged` counts non-contacted; dataset retention; content-draft test gating.

---

## 22. Quick wins

1. Remove `updated_at` everywhere it is queried on `leads` (done).
2. Enable RLS on `intelligence_sample_events` (done).
3. Fix dataset metrics count + org scope (done).
4. Gate the two admin performance routes (done).
5. Add `%` and U+2011 to `hasUnfilledValues` and apply to Upwork paths.
6. Add STOP patterns to `conversation/intent.ts`.
7. Persist `sender_profile_id` on `markContacted`.
8. Wire `hallucination-guard` into the composer.
9. Delete the 10 dead pages and 13 dead components.
10. Fix the duplicate migration versions.

---

## 23. Things to remove

Dead pages (§17); dead components (§17); `intelligence-v2` after confirming no live import; `lib/score/rubric` as a *writer* (keep only if a surface still reads `/12`); `next_followup_at`; `relay/hallucination-guard` if not wired; superseded API families (§17).

## 24. Things to merge

`content-v2` + `studio-v2`; `/chats` + `/relay`; `/conversations` (into `/chats`); the three follow-up clocks (into `leads/followup.ts`); the two `calculateContactWindow` copies.

## 25. Things to redesign

Accountability dashboard (correct data + no N+1); Revenue Intelligence (correct data); Today queue (make next-action undeniable); Leads pipeline (one scale); Studio (decide its job); follow-up policy (one source of truth).

---

## 26. Real-data findings

Live counts (2026-10-24): organizations **11**, reps **18**, leads **393**, captured_prospects **718** (all `captured`, **0 converted**), upwork_jobs **60**, upwork_messages **96**, messages **529** (all `sender_profile_id` NULL), outcomes **32**, action_events **2,810** (957 NULL idempotency key, 2 dup), ai_traces **2,978** (all cost 0), extraction_runs **460**, edit_learning **950**, intelligence_samples **430**, intelligence_sample_events **1,329**, scoring_feedback **21**, profiles **14**, revenue_identities **11**, proof_cards **39**, proof_items **0**, portfolio_projects **54**, profile_claims **186**, scoring_labels **0**, scoring_shadow_decisions **2,868**, help_requests **0**, profile_opportunity_matches **0**.

Leads: 25 unscored; verdict research_more 301 / send 59 / skip 23 / null 10; status contacted 338 / new 31 / replied 16 / lost 3 / **won 3** / no 1 / followed_up 1; score_version v3.3.0 246 / v3.2.0 73 / v3.1.0 48 / null 26; 4 test rows.

Compared to the 2026-10-22 audit (leads 134, prospects 200, messages 168, shadow 0), the system has grown ~3× while `scoring_labels` stayed at 0 — **the learning loop is not producing ground truth.**

---

## 27. Test results

- **Typecheck:** clean (`npx tsc --noEmit`, exit 0).
- **Full suite, before this pass's fixes:** 3,054 pass / 8 fail (5 files).
- **Full suite, after this pass's fixes:** **3,063 pass / 6 fail** (4 files) — **no new failures**; the 2 `conversation-system` failures from the first run passed on re-run, so they are **FLAKY**. Remaining 6 are **pre-existing**, all in identity extraction:
  - `hardening-regression-avigail` ×3 (remote eligibility NOT_APPLICABLE)
  - `hardening-regression-brian` ×1, `hardening-regression-elijah` ×1 (person/company identity from header)
  - `hardening-regression-daria` ×1 (empty connection note)
- **New guard suite:** `tests/relay-p0-fixes-2026-10-24.test.ts` — 8 tests pass.
- **Classification:** PRE_EXISTING (6), NEW (0), FLAKY (2), ENVIRONMENTAL (0), BLOCKING (0 new).

## 28. Browser results

**Not run.** No running app or deployed-SHA parity in this environment. Per `docs/qa-closure/RECHECK_PLAN.md`, browser rows are INVALID until the tested SHA is redeployed and the matrix (Chrome/Firefox/Safari/375px/physical device) is run. The 8 QA items still `NEEDS_BROWSER` (RQA-008, 033, 036, 037, 038, 039, 040, 046) and the 6 `BLOCKED` items (RQA-001, 002, 005, 023, 024, 025) remain open from the prior pass.

## 29. Files changed

- `supabase/migrations/20261024120000_intelligence_sample_events_rls.sql` (new)
- `src/lib/accountability/metrics.ts`
- `src/app/api/admin/revenue-intelligence/route.ts`
- `src/app/api/admin/performance/route.ts`
- `src/app/api/admin/rep-performance/route.ts`
- `src/app/api/leads/[id]/refresh-intelligence/route.ts`
- `src/lib/dataset/metrics.ts`
- `tests/relay-p0-fixes-2026-10-24.test.ts` (new)
- `docs/RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md` (new, generated)
- `docs/RELAY_AUDIT_2026-10-24.md` (this file)

## 30. What was not changed

Scoring weights/bands (no promotion); routing engine; message templates; the PII dump (destructive); the duplicate migrations (renumbering is a team coordination task); the follow-up clocks (needs a product decision); Studio/content surfaces; no production writes.

## 31. Remaining risks

1. **The PII dump is still in the repo and its history.** Until purged, the repository itself is the exposure.
2. **Browser verification is outstanding** for every UI claim, including the 5 fixes in this pass.
3. **The migration is unapplied.** `20261024120000` must be applied in a maintenance window and re-verified with `scripts/scoring/audit-dataset.ts --migrations`.
4. **Score collapse and message quality are unfixed** — the two things that most affect whether a BD rep trusts Relay daily.
5. **Zero human labels** means no candidate can be promoted and no metric is trustworthy as "ground truth".
6. **Follow-up policy is contradictory** and can cause a rep to contact a prospect the DB says is ineligible.

---

## FINAL VERDICT

**PRODUCT STATUS: CONDITIONAL**

- The data plumbing, versioning, and security architecture are production-grade.
- The surfaces that reps and admins read every day are showing **wrong numbers as truth** and the messages that are supposed to close business are **untrustworthy**.
- Ship only after: P0-1..P0-4 are deployed + browser-verified, the PII dump is purged, and the follow-up/opt-out path is fixed.

**SCORING STATUS: IMPROVED BUT NOT STABLE**
(78% MAYBE, 0% SKIP, non-monotone commercial potential, 31% stale packets, zero human labels, routing v2 unwired. The ordinal model is the best-calibrated candidate but cannot be promoted.)

**MESSAGE QUALITY: NEEDS IMPROVEMENT** (leaning NOT SALES READY)
(~15% BAD, ≥3 fabricated, identity guard dead, generic openers dominate, sender id never persisted.)

**UX STATUS: FUNCTIONAL BUT NEEDS POLISH**
(consistent design system and real craft, but 10 dead pages, 13 dead components, 3 duplicate engines, layout-only auth on 23 pages, unresolved mobile nav trap.)

**DATA STATUS: PARTIAL**
(Multi-tenancy, RLS, idempotency and export redaction are strong; but one table had no RLS, raw PII is committed, and multiple admin metrics were silently zero.)

---

*Skipped: browser/device verification (no running app); did not purge the PII dump (destructive, needs team approval); did not renumber duplicate migrations (coordination); did not touch scoring weights, routing, or message templates. | Risk: the five code fixes are unit/type-verified only — they must be browser-verified on the deployed SHA before GO; the unapplied migration and the committed PII remain live exposures until the team acts.*

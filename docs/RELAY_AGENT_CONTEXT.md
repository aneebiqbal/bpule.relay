# Relay — Agent Context (single source of truth)

> **Purpose.** One self-contained brief for an agent that writes prompts (or code)
> against Relay. It answers: what Relay is, what exists, what the last 10 commits
> built, where prompts and the eval harness live, and which doc owns which truth.
>
> Snapshot: **2026-11-13** · HEAD `56566b59` · branch `main` · clean tree ·
> LOCAL == REMOTE. Where this file and a code comment disagree, the code wins.
>
> Read order for a new agent: this file → `docs/README.md` (doc index) → the
> owning doc named in §9. Do not read `docs/archive/` unless a contract points
> there; it is evidence, not truth.

---

## 1. The request this brief serves

Build an agent that helps write **prompts for Relay's harness**. In this repo
"harness" means two connected things:

1. **The AI pipeline** — Calibrate → Extract → Score → Draft, with exactly one
   strong-model call per lead at draft time and scoring as pure arithmetic.
2. **The eval harness** — the golden-set runner that turns "I think this prompt
   is better" into a number: `src/lib/ai/eval.ts`, `/api/eval/run`,
   `/api/eval/golden`, `/api/eval/cron-run`, `/team/eval`.

So a prompt agent must know: the canonical prompt fragments, the bounded-decision
provider prompts, the draft prompt + self-check, the golden set, prompt
versioning, and the release gates a prompt change must pass.

---

## 2. Repo facts

| Field | Value |
|---|---|
| Product | **Relay** (internal lead-gen operations system for bpulse) |
| Repo dir / package | `/Users/mac/Desktop/products/scout` · npm name `scout` |
| Remote | `github.com/aneebiqbal/bpule.relay.git` |
| Branch / HEAD | `main` · `56566b59` (2026-11-13) · 1129 commits · clean |
| App version | `0.8.0` (`src/lib/version.ts`) |
| Stack | Next.js 16.3.4 · React 19.2.8 · TypeScript 5 · Tailwind 4 · Better Auth · Postgres · Vercel |
| Tests | Vitest 5 · Playwright 1.63 · 405 test files · 61 e2e specs |
| DB migrations | 188 files in `supabase/migrations/` |
| Docs | 46 top-level `docs/*.md` + `docs/archive/` (historical) |

Commands: `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm exec tsc --noEmit` ·
`pnpm test` · `pnpm qa:contracts` · `pnpm qa:coverage` · `pnpm qa:release` ·
`pnpm qa:live-provider` (smoke, needs keys).

---

## 3. What Relay is

Relay runs the **Calibrate → Extract → Score → Draft** pipeline end to end:

1. **Calibrate** (once per rep) — quiz + optional pasted messages → a style card.
   Every later draft is written in that voice.
2. **Extract** — raw research → structured fields, cheapest capable model.
3. **Score** — a published rubric in code only. No model. See §5.
4. **Draft** — one strong-model call that drafts AND self-checks against two fixed
   tests (a senior engineer would reply; the message survives a company swap). A
   failed check rewrites once on the same call shape; never ships half-passed.

**Guardrails (product law):** no auto-send anywhere; drafts may only claim numbers
in the Facts table; no em dashes; `no`/`dead` companies locked forever; daily send
ceiling per rep (default 15). Autonomy is per-action policy (`MANUAL` /
`APPROVAL_REQUIRED` / `AUTOPILOT`), never a property of a sent message.

---

## 4. The AI / prompt layer (where prompts live)

**Shared prompt fragments — `src/lib/ai/prompts.ts`.** Single source of truth for
rules duplicated across draft, forge, content, message-forge: `ANTI_AI_RULES`,
`FACTUALITY_RULES`, `SURVEILLANCE_RULES`, `CTA_RULES`, `SPECIFICITY_RULES`,
`VOICE_RULES`, `FORMATTING_RULES`, `BANNED_PHRASES_COMPACT`, `CONTENT_DNA_RULES`.
Rule: if code enforces it deterministically, do not repeat it in a prompt. Keep
prompts short; code is the real gate.

**Model routing — `src/lib/ai/routing.ts` → `config.ts`.** No feature code names a
model id. Defaults: extraction `openai/gpt-oss-20b`, drafting
`openai/gpt-oss-120b`; overrides `SCOUT_CHEAP_MODEL` / `SCOUT_STRONG_MODEL`.
Runtime providers in `src/lib/ai/runtime/providers/` (groq, openai, longcat,
opencode) behind `runtime/model-router.ts`.

**Prompt-bearing call sites:**

| Concern | File |
|---|---|
| Draft + self-check | `src/lib/ai/draft.ts`, `src/lib/ai/draft-stream.ts` |
| Bounded decision (one structured call) | `src/lib/intelligence-v3/decision/decision-assembler.ts`, `decision-provider.ts`, `openai-provider.ts`, `longcat-provider.ts` |
| Event extraction | `src/lib/intelligence-v3/event-extractor.ts` |
| Orchestrator / versions | `src/lib/intelligence-v3/orchestrator.ts`, `versions.ts` |
| Writing engines | `src/lib/writing/engine.ts`, `src/lib/growth/writing-engine.ts`, `src/lib/relay/daily-persona-post-engine.ts` |
| Content decisions | `src/lib/content/daily-decision.ts` |
| Conversation composer | `src/lib/conversation/composer.ts` |
| Style / onboarding | `src/lib/style/quiz.ts`, `src/lib/ai/onboarding-questions.ts` |

**Prompt versioning.** Every decision packet carries `versions` (scoring,
sourceFacts, buyerIntent, attribution, routing, actionPolicy, display, **prompt**,
model, analyzedAt). `isPacketCurrent` gates every cache; an old packet is
recomputed on open. A prompt change is therefore a **version bump**, not a silent
edit.

---

## 5. Scoring (the deterministic half)

`docs/SCORING_ARCHITECTURE.md` is the owner. Version `relay_decision_v3.3.0`.

- One canonical score: `scoreEpisode` in `src/lib/intelligence-v3/scoring/score-v3.ts`.
- Additive, seven bounded dimensions: buyerIntent .25 · commercialPotential .20 ·
  fit .15 · authority .10 · timing .10 · access .10 · evidenceQuality .10, minus a
  competitor penalty. No multiplicative collapse, no hidden floors.
- Bands: STRONG 75–100 · WORTH_PURSUING 55–74 · MAYBE 35–54 · LOW 15–34 · SKIP 0–14.
- Display `display_v2` maps to 1–10, monotonic and band-aligned.
- **Confidence is not the score.** `computeConfidence` reports certainty; LOW
  confidence triggers `RESEARCH_MORE`.
- **Source facts are the authority.** Model answers are clamped to source facts;
  disagreements are recorded in `contradictions`, not obeyed.
- Candidate engines live in `src/lib/scoring-v4/` (v3, calibrated_v4,
  ordinal_logit, gbdt_pairwise, knn_features) behind `engines/registry`, with shadow
  mode. Production is engine `v3`.

---

## 6. Eval harness (how prompts are judged)

| Piece | Location |
|---|---|
| Runner | `src/lib/ai/eval.ts` → `runEval(cases, promptVersion)` |
| Orchestration | `src/app/api/eval/run/route.ts` → `runEvalHarness(store, promptVersion)` |
| Golden cases | `store.listGoldenSet()`; admin UI `/api/eval/golden` |
| Cron trigger | `/api/eval/cron-run` (off-peak) |
| Admin surface | `src/app/(app)/team/eval/page.tsx` |
| Metrics | replyRateScore · selfCheckPassRate · companyMentionRate · evidenceMentionRate · overallScore · per-case similarity to known-good sent text |
| Golden-set contract | `docs/GOLDEN_SET.md`; fixtures in `tests/golden/` |

A prompt change is validated by running the harness against the golden set and
comparing `overallScore`, not by vibes. `tests/golden/golden-set.test.ts` and
`tests/qa-relay-message-quality-*.test.ts` guard the invariants.

---

## 7. Information architecture (canonical)

Navigation authority: `src/lib/navigation/relay-shell-nav.ts` (`NAV_DOMAINS`).
Rendered by `src/components/v4/v4-app-shell.tsx`.

| Domain | Route | Visible to |
|---|---|---|
| Home | `/dashboard` | everyone (role-branched cockpit) |
| Sales | `/leads` | everyone (Prospects, Leads, Pipeline, Companies manager+, Import, Upwork, Email) |
| Inbox | `/chats` | everyone (needs-reply / waiting / follow-ups / all) |
| Work | `/tasks` | everyone (today/overdue/upcoming/completed; team scope manager+) |
| Team | `/team` | manager+ (Today, People, Profiles, Performance, Structure) |
| Content | `/content` | everyone (Studio, Ideas; Growth admin+) |
| Insights | `/reports/sales` | everyone (Sales, Pipeline, Revenue, Activity) |
| Settings | `/settings` | everyone |
| Admin | `/admin/command` | admin+ (Command, People & Roles, Daily Targets, Revenue Intelligence, System/Quality) |

Roles come from `organization_roles` (`src/lib/auth/organization.ts`); `reps.role`
is bootstrap-only and can never escalate. `isProductAdmin = isOwner || isAdmin`.

Canonical data authorities (full table in `docs/RELAY_PRODUCT_MAP.md` §4): needs
reply → `deriveConversationRow`; tasks → `loadUnifiedTasks` +
`classifyUnifiedTaskTab`; targets → `getDailyWorkspace.targetSummary` /
`loadTargets`; coverage → `lib/coverage/load.ts`; ownership → `profile_coverage`
+ `coverage_assignments`; timeline → `loadTimeline`; inbox nav →
`lib/navigation/inbox-nav.ts`.

---

## 8. Product contracts (release-gating)

Owner: `docs/RELAY_PRODUCT_CONTRACTS.md`. Runtime map:
`docs/RELAY_CONTRACT_RUNTIME_MAP.md`. Change process:
`docs/RELAY_CONTRACT_CHANGE_PROCESS.md`. **No silent behavior changes** — change
the contract doc + every dependent test in the same change.

1. Title and employer are separate canonical fields.
2. A high-potential builder needs product/technical evidence (title alone is not enough).
3. One lead has one canonical action/state across every surface (`lead-parity.ts` is a required RC check).
4. Verified source truth outranks model disagreement.
5. Terminal state overrides historical intent.
6. Unknown is not zero (never fabricate a value).
7. Persistence and UI state reflect actual lifecycle state.
8. All external text enters intelligence through `normalizeExternalInput()` first.
9. RAW input is not ANALYZED input (no score before extraction completes).
10. The decision reviewed by the user is the decision persisted on save.
11. Canonical message rows own the conversation timeline.
12. UI cannot advertise an auth capability the deployment cannot execute.
13. A recruiter is a relationship, not a buying signal.
14. One email delivery authority; a mailbox belongs to a sender identity.
15. Autonomy is a policy of the action, not a property of a sent message.
16. A send is blocked, not guessed (`evaluateEmailSendEligibility`).
17. Displayed send policy equals enforced send policy (`resolveSendPolicy`).

Every S1/S2 fix must become a named regression fixture and, where applicable, a
contract. A fix without a fixture can silently return.

---

## 9. Docs map — which file is the truth

`docs/README.md` is the index. Current (active) contracts:

| Doc | Owns |
|---|---|
| `RELAY_PRODUCT_MAP.md` | Canonical domains, route matrix, role matrix, data authorities |
| `RELAY_PRODUCT_CONTRACTS.md` | The 17 product decisions |
| `RELAY_CONTRACT_RUNTIME_MAP.md` | Contract → owner → consumers → tests |
| `RELAY_CONTRACT_CHANGE_PROCESS.md` | How a contract may change |
| `RELAY_FEATURE_VISIBILITY_MATRIX.md` | Feature × role traceability |
| `RELAY_UI_SYSTEM_V2.md` | Design-system primitives (PageHeader/FilterBar/DataTable/…) |
| `RELAY_NAVIGATION_V3.md` | Role-aware navigation contract |
| `SCORING_ARCHITECTURE.md` · `SCORING_INVARIANTS.md` · `GOLDEN_SET.md` | Scoring + eval reference data |
| `SENDER_ROUTING.md` · `FOLLOWUP_POLICY_MAP.md` | Sending-profile routing, follow-up cadence |
| `RELAY_NEON_CUTOVER_FINAL.md` · `RELAY_MIGRATION_RECONCILIATION_2026-11.md` | DB history + migration reconciliation |
| `RELAY_PUBLIC_RELEASE_READINESS.md` | Release gate + known debt |
| `OPS.md` | Running Relay in production (backups, rollback, incidents, env vars) |
| `supabase/aiven/CUTOVER.md` · `RETIRE-NEON.md` | Current infra switch runbooks |

`docs/archive/` = dated status reports and point-in-time audits. Evidence, not
contracts.

---

## 10. Infrastructure — current state (2026-11-13)

| Dependency | State |
|---|---|
| Database | **Aiven Postgres** `relay_prod_final` · `RELAY_DB_PROVIDER=postgres` |
| Auth | **Better Auth in-app** against Aiven (`neon_auth` schema) · `RELAY_AUTH_PROVIDER=aiven` |
| Object storage | Aiven Postgres `public.storage_objects` (no Supabase Storage) |
| App role | `relay_app` (RLS enforced, `app.current_user_id` set per transaction) |
| Service role | `relay_service` via `SERVICE_DATABASE_URL` (cron/webhooks only) |
| Pools | app 12, service 1 (dashboard fires ~627 queries; pool 3 starves) |
| Rollback | `RELAY_DB_PROVIDER=supabase` / `neon` + redeploy previous SHA |

`GET /api/version` reports `sha`, `databaseProvider`, `authProvider` — the
quickest truth check. Deployment is Vercel; custom domain `relay.bpulse.dev`.

---

## 11. Last 10 commits — what was built (all 2026-11-13)

| SHA | Build |
|---|---|
| `56566b59` | **Team execution heatmap** — Team Today shows who worked when, per rep, per business date. `teamHourlyActivitySql` aggregate on `action_events` (executed weighted actions, failures excluded), org-timezone hours, batched read with PostgREST fallback, grid + sr-only table + text readout (never colour-only). Verified live on Aiven (UTC 11:00 → Karachi 16:00). |
| `80f9442a` | **Operator contribution allocations (SHARED vs ALLOCATED)** — optional per-operator expectation under a shared channel plan; requirement counted once. `daily_plan_allocations` table, `plan-model` allocation math + over-allocation guard, `GET/POST /api/admin/targets/[id]/allocations` (idempotent replace), SHARED/ALLOCATED toggle in the targets editor, "your target X · your contribution Y" on rep cards. |
| `76fe8732` | **Chore** — removed historical `upwork.pdf` from the tree, gitignored it, dropped the migration reference. |
| `55a11849` | **DB capacity fix** — 10s connect timeout, 30s idle timeout, Better Auth pool 4→2. A Vercel burst had driven Aiven to its connection limit; sign-in returned 500. |
| `d38146af` | **Perf fix** — aggregation fast path gated on `provider === 'neon'`; now gates on `raw()` presence so the Postgres/Aiven provider uses SQL aggregates instead of fetching raw `action_events` rows and tallying in memory. |
| `05829176` | **Team** — empty state for the schedule tab. |
| `4a363080` | **Team Today** — surfaces working-now / next shift / coverage gap via the same time-aware resolver as the rest of the product (one authority). |
| `fcbc7ddf` | **Schedules fix** — `pg` returns `time` as `HH:MM:SS`; parser now accepts seconds. Previously every shift resolved to no operator and the 24h gate reported a full-day gap. |
| `5b75f8fb` | **Operator schedules (V7) + notification inbox reset** — `responsibility_schedules` (profile-level, midnight-crossing, DOW recurrence, effective dating, RLS); `lib/schedules/model.ts` single resolver (`resolveCurrentOperators`, next shift, 24h gaps, overlap conflicts) wired into the coverage engine; admin Schedule tab + shift editor; `GET/POST /api/team/profiles/[profileId]/schedules`. Reset: mark inbox read, delete only stale read system noise >7d, never touches action/coverage/task/message history. |
| `1017c26c` | **Auth fix** — trust the request's own origin plus `BETTER_AUTH_TRUSTED_ORIGINS`; custom-domain requests were rejected `INVALID_ORIGIN` (403). |

**Theme of the last 10:** team operations maturity (schedules, coverage, targets,
execution heatmap) on top of the Aiven cutover, plus two production fixes
(connection capacity, aggregation path) and one auth origin fix.

---

## 12. What exists — surface inventory

- **109 page routes** under `src/app` (app shell, public site, 18 docs pages,
  onboarding, fixtures). Canonical route matrix: `docs/RELAY_PRODUCT_MAP.md` §2.
- **62 lib domains** under `src/lib` — notably `intelligence-v3`, `scoring-v4`,
  `email`, `scheduler`, `schedules`, `coverage`, `targets`, `conversation`,
  `content`, `growth`, `team`, `profiles`, `profile-intelligence`, `ai`.
- **28 component domains** under `src/components` — `v4` shell, `team`, `chats`,
  `leads`, `content-v3`, `scoring`, `ui`.
- **Compatibility redirects** (308) keep legacy URLs resolving; list in
  `RELAY_PRODUCT_MAP.md` §7.
- **Dead code:** ~16 unused component files (~3,400 lines) listed in
  `RELAY_PRODUCT_MAP.md` §5.2. Do not build on them.

---

## 13. Open issues an agent must respect

From `RELAY_PRODUCT_MAP.md` §8 (structural):

1. Five implementations of "replies waiting"; only two use canonical
   `deriveConversationRow`.
2. Sidebar Work badge predicate ≠ `/tasks` scope.
3. `/tasks` scopes derived actions to the active workspace; `/dashboard` does not.
4. `loadRepDayDetail.followUpsDue` is hardcoded `0`.
5. `/studio/drafts/new` is linked without a `personaId`, so it always redirects.
6. Eight dead components (~2,900 lines).
7. `/inbound` is a second Inbox with its own loader and no nav entry.

From `RELAY_PUBLIC_RELEASE_READINESS.md` §6: responsive/axe matrix incomplete
(machine contention); Inbox notes e2e not run on the final SHA; coverage
readiness list is channel-first while the directory is person-first.

From `RELAY_MIGRATION_RECONCILIATION_2026-11.md`: 6 migrations still needed
applying at the time of the audit (`20261023000000`, `20261029120001`,
`20261031120000`, `20261101120000`, `20261101130000`, `20261101140000`), version
collisions resolved by renaming, and a notifications shape/RLS defect. Verify
current applied state before relying on it.

`docs/PII_GIT_REMEDIATION.md` — open P0: gitignore/untrack done; history rewrite +
credential rotation still owner-assigned.

---

## 14. Rules for writing prompts / code here

1. **Contract first.** If a decision is in `RELAY_PRODUCT_CONTRACTS.md`, the code
   must obey it. If a test conflicts with a contract, investigate the test first.
2. **One owner per value.** Never re-derive a canonical value in a second place;
   point the consumer at the owner (runtime map).
3. **Prompts are short; code is the gate.** Enforce deterministically in code
   wherever possible; do not duplicate code-enforced rules in prompts.
4. **Prompt changes are versioned.** Bump the prompt version
   (`intelligence-v3/versions.ts`) so stale packets recompute.
5. **Validate with the harness.** Run `runEval` / `pnpm qa:contracts`; a prompt edit
   without a golden-set comparison is unfinished.
6. **Every S1/S2 fix becomes a fixture.** Add a named regression fixture in
   `tests/fixtures/` or `tests/golden/`.
7. **No em dashes in generated text**; strip in code, not by prompt alone.
8. **Unknown is not zero.** Never let a prompt/fabricated value fill a missing fact.
9. **Gates before merge:** `pnpm lint` · `pnpm exec tsc --noEmit` · `pnpm build` ·
   `pnpm qa:contracts` · `pnpm qa:coverage` (zero skipped) ·
   `tests/relay-contract-owners.test.ts` · `tests/relay-regression-corpus.test.ts`.
10. **UI changes** follow `RELAY_UI_SYSTEM_V2.md` primitives and the V4 shell; the
    design-language rules in the repo `AGENTS.md` apply to generated UI code.

---

## 15. One-paragraph summary

Relay is a Next.js 16 multi-tenant lead-gen operations product (bpulse, codename
Relay, v0.8.0) running on Aiven Postgres with in-app Better Auth. It turns raw
profiles/jobs into one commercial decision through a Calibrate → Extract → Score →
Draft pipeline: scoring is deterministic arithmetic in `intelligence-v3`, and a
single strong-model call drafts and self-checks the message. Prompts live in
`src/lib/ai/prompts.ts` and the decision/draft providers, are versioned in the
decision packet, and are judged by the golden-set eval harness in
`src/lib/ai/eval.ts` (`/team/eval`). The last 10 commits (2026-11-13) built team
operating maturity — operator schedules, coverage resolution, target allocations,
execution heatmap — plus Aiven cutover fixes. The canonical truth is
`docs/README.md` → `RELAY_PRODUCT_MAP.md` + `RELAY_PRODUCT_CONTRACTS.md`; the
historical record is `docs/archive/`.

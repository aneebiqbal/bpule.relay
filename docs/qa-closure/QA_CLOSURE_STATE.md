# Relay QA Closure — Session State

> Maintained across sessions. Read this first at the start of every session, then
> inspect `git status`, confirm HEAD, and continue from the first unresolved item.
> Do not restart the audit from scratch.

Report source of truth: **bPulse Relay — Final End-to-End QA Bug Report (Sections 1–14)**,
21 Oct 2026, RQA-001 → RQA-048. Severity rubric and acceptance criteria are taken from
that report verbatim.

---

## Session 0 — Baseline / deployment / security

| Field | Value |
| --- | --- |
| Branch | `main` |
| HEAD SHA | `a460910e0a8bc7db1ca1ada84a19bc8b6789bb5e` |
| origin/main SHA | `a460910e0a8bc7db1ca1ada84a19bc8b6789bb5e` |
| Deployed SHA | **UNKNOWN** — no Vercel CLI access in this environment; `relay.bpulse.dev` build SHA not retrievable here |
| Build SHA | not captured |
| Scoring version | `relay_decision_v3.3.0` (`src/lib/intelligence-v3/versions.ts`) |
| Source facts version | `source_facts_v1` |
| Buyer intent version | `buyer_intent_v5` |
| Action policy version | `action_policy_v2` |
| Display version | `display_v2` |
| App version | `0.8.0` (`src/lib/version.ts`) |
| Migrations | 117 declared / 117 applied per `docs/RELAY_E2E_AUDIT_2026-10-22.md`; governance migration `20261022110000` written, apply status not re-verified this session |
| Dirty files | see below |
| Untracked files | see below |

**Deployment parity:** deployed SHA ≠ tested source cannot be confirmed. Per the program
rules, **browser verification is INVALID until the tested SHA is redeployed** and the
deployed SHA is recorded here.

**Dirty files this session (QA fixes only, Session 1 + 2):**
```
 M src/app/(app)/archive/page.tsx
 M src/app/api/admin/performance/config/route.ts
 M src/app/api/admin/performance/route.ts
 M src/app/api/admin/rep-performance/route.ts
 M src/app/api/inbound/analyze/route.ts
 M src/app/api/leads/[id]/refresh-intelligence/route.ts
 M src/app/api/leads/[id]/reply-strategies/route.ts
 M src/app/api/leads/route.ts
 M src/app/api/leads/signal-watch/route.ts
 M src/components/lead-decision-context-card.tsx
 M src/components/lead-workspace-simple.tsx
 M src/lib/ai/draft-stream.ts
 M src/lib/intelligence-v3/buyer-intent.ts
 M src/lib/intelligence-v3/scoring/score-v3.ts
 M src/lib/intelligence-v3/source-facts.ts
 M src/lib/prospect/paste-normalize.ts
 M src/lib/relay/conversation-engine.ts
 M src/lib/relay/profile-intelligence.ts
 M src/lib/relay/sender-routing-engine.ts
 M src/lib/scoring/signal-extractor.ts
 M src/lib/store/supabase-store.ts
 M src/lib/store/types.ts
?? docs/qa-closure/
?? src/app/api/leads/[id]/archive/
?? src/components/leads/archived-leads-list.tsx
?? src/lib/inbound/signature.ts
?? tests/qa-rqa-sections-1-7.test.ts
?? tests/qa-rqa-session2-auth.test.ts
?? tests/qa-rqa-session2.test.ts
```
Pre-existing untracked, **not touched**: `e2e/qa-deploy-verify.spec.ts`.

**Security notes carried forward (from `docs/RELAY_E2E_AUDIT_2026-10-22.md`, not re-run):**
- Git remote URL embeds a credential (local `.git/config`, not committed) — team action.
- 39 production dump files tracked under `audit-reports/historical-intelligence/` — GRC action.
- No secrets were printed this session. `.env.local` was read only to confirm key presence.

---

## Status model

Every item ends in exactly one state:

- `FIXED_AND_BROWSER_VERIFIED`
- `FIXED_AND_API_VERIFIED`
- `FIXED_AND_UNIT_VERIFIED`
- `NOT_A_BUG_WITH_EVIDENCE`
- `BLOCKED_WITH_EXACT_REASON`

Release sign-off: S1 must be `FIXED_AND_BROWSER_VERIFIED`; S2 browser/API verified; S3
verified against the exact reported scenario; S4 visibly verified where UI-related.

> **This session's browser verification is not performed.** No running app + production
> credentials were available, and running browser flows against the shared Supabase
> project was out of scope without approval. S1/S2/UI items are therefore `BLOCKED` or
> `NEEDS_BROWSER`, never claimed fixed.

---

## RQA-001 → RQA-048 closure table

| ID | Sev | Status | Evidence / notes |
| --- | --- | --- | --- |
| RQA-001 | S2 | `BLOCKED_WITH_EXACT_REASON` | Studio 375px nav trap. UI/browser. Needs running app + 375px emulation; not run this session. |
| RQA-002 | S3 | `BLOCKED_WITH_EXACT_REASON` | Builder/founder score below baseline. Deterministic path already yields 43/MAYBE for Paste B; production 5/10 came from the model's timing answer. Needs a product decision on whether the calibrated band changed the QA expectation. |
| RQA-003 | S3 | `FIXED_AND_UNIT_VERIFIED` | LinkedIn chrome ("3rd · Connect", "2. · Vernetzen") never becomes role/company. `paste-normalize.ts` + `signal-extractor.ts`; `tests/qa-rqa-sections-1-7.test.ts`. |
| RQA-004 | S3 | `FIXED_AND_UNIT_VERIFIED` | Job-seeker line no longer raises buyer-request contradictions. `signal-extractor.ts` (`explicitAsk`/`hiring`/`seekingVendor`); test in `qa-rqa-sections-1-7.test.ts`. |
| RQA-005 | S3 | `BLOCKED_WITH_EXACT_REASON` | 420-day-old request over-scored in production. Deterministic timing already penalises (timing raw 0.30, watchOut 420d). Model-side timing calibration required; no deterministic change made. |
| RQA-006 | S4 | `FIXED_AND_UNIT_VERIFIED` | "Budget stated: stated" → "Budget available — amount not stated". `score-v3.ts`; test in `qa-rqa-sections-1-7.test.ts`. |
| RQA-007 | S3 | `FIXED_AND_UNIT_VERIFIED` | Sender baseline never 0. `api/prospect/analyze` uses the active sender's real match; `tests/profile-access-and-sender-suggestion.test.ts`. |
| RQA-008 | S3 | `NEEDS_VERIFICATION` | Prospect vs lead parity. `tests/canonical-score-surface-consistency.test.ts` + `score-parity-save-replay.test.ts` exist; exact reported Sophia scenario not re-run. |
| RQA-009 | S3 | `FIXED_AND_UNIT_VERIFIED` | Sender-match card rendered on the lead. `lead-decision-context-card.tsx` (`SenderMatchCard`); `holderRepIds` added to rankings. |
| RQA-010 | S2 | `FIXED_AND_UNIT_VERIFIED` | Ask for Help control wired to `/api/leads/[id]/help`. `SenderMatchCard`; test in `qa-rqa-session2.test.ts`. |
| RQA-011 | S3 | `FIXED_AND_UNIT_VERIFIED` | Keep Current Owner control dismisses the mismatch. `SenderMatchCard`. |
| RQA-012 | S2 | `FIXED_AND_UNIT_VERIFIED` | Draft stream always ends terminally; the client surfaces `needs_rescoring` instead of a blank note. `draft-stream.ts` + `lead-workspace-simple.tsx`; test in `qa-rqa-session2.test.ts`. |
| RQA-013 | S3 | `FIXED_AND_UNIT_VERIFIED` | Explicit buying confirmation / meeting request reads as interested/meeting_request, not pricing/neutral. `conversation-engine.ts` (`analyzeReply`); test in `qa-rqa-session2.test.ts`. |
| RQA-014 | S3 | `FIXED_AND_UNIT_VERIFIED` | Do-not-contact closes outreach. `leadClosedForOutreach` + `deriveNextLeadAction`; `tests/qa-20-oct-finalization.test.ts` (REL-QA-014). |
| RQA-015 | S3 | `FIXED_AND_UNIT_VERIFIED` | Won/Lost outcome rendered as its own History row. `getLead` exposes `wonAt`/`lostAt`; `lead-workspace-simple.tsx`; test in `qa-rqa-session2.test.ts`. |
| RQA-016 | S2 | `FIXED_AND_UNIT_VERIFIED` | Browser routes authenticate the signed-in rep, not the service client. Fixed in `refresh-intelligence` + 4 sibling routes; sweep test in `qa-rqa-session2-auth.test.ts`. |
| RQA-017 | S3 | `FIXED_AND_UNIT_VERIFIED` | A manual lead with research is scored through the canonical pipeline (one state); a manual lead without research is left unscored. `api/leads/route.ts`. |
| RQA-018 | S2 | `FIXED_AND_UNIT_VERIFIED` | Manual-only creation allowed (name/company/title, no pasted source) and left unscored. `api/leads/route.ts`; test in `qa-rqa-session2.test.ts`. |
| RQA-019 | S2 | `FIXED_AND_UNIT_VERIFIED` | Manual archive/restore API + lead-detail control + archived-leads list with Restore. `api/leads/[id]/archive`, `archived-leads-list.tsx`. |
| RQA-020 | S3 | `FIXED_AND_UNIT_VERIFIED` | Inbound trailing signature "– Name, Role at Company" is lifted into a profile block; Jonas/CTO/Fenwick Pay + HIGH buyer. `lib/inbound/signature.ts`; test in `qa-rqa-session2.test.ts`. |
| RQA-021 | S3 | `FIXED_AND_UNIT_VERIFIED` | Freelancer offer classified SELLER, not buyer. `source-facts.ts` SELLER_GRAMMAR; test in `qa-rqa-sections-1-7.test.ts`. |
| RQA-022 | S3 | `FIXED_AND_UNIT_VERIFIED` | Re-analysis replaces generated fields. `mergeExtractedFields`; `tests/qa-20-oct-finalization.test.ts` (REL-QA-013). |
| RQA-023 | S3 | `BLOCKED_WITH_EXACT_REASON` | 7d/30d/90d controls. UI. |
| RQA-024 | S4 | `BLOCKED_WITH_EXACT_REASON` | Performance discoverability. UI. |
| RQA-025 | S4 | `BLOCKED_WITH_EXACT_REASON` | Navigation latency. Perf measurement required (`scripts/perf-navigation.mjs`). |
| RQA-026 | S3 | `FIXED_AND_UNIT_VERIFIED` | Self-declared FAKE/TEST/DEMO proof never quoted. `isProductionSafeProof` gate; test in `qa-rqa-sections-1-7.test.ts`. Existing proof rows still need a data audit (not a code change). |
| RQA-027 | S4 | `FIXED_AND_UNIT_VERIFIED` | Facts raw JSON rendered human-readable. `facts-manager.tsx` (HEAD BUG-08-02). |
| RQA-028 | S3 | `FIXED_AND_UNIT_VERIFIED` | Blank job shows no score. `upwork/new/page.tsx` (HEAD BUG-11-01). |
| RQA-029 | S3 | `FIXED_AND_UNIT_VERIFIED` | Proposal range kept verbatim. `upwork/extract` (HEAD BUG-11-02). |
| RQA-030 | S3 | `FIXED_AND_UNIT_VERIFIED` | Missing Connects stays unknown. `upwork/[id]/page.tsx` (HEAD BUG-11-03). |
| RQA-031 | S3 | `FIXED_AND_UNIT_VERIFIED` | Fixed budget canonical min=max. `upwork-rubric.ts` (HEAD BUG-11-04). |
| RQA-032 | S3 | `FIXED_AND_UNIT_VERIFIED` | Generate disabled with exact reason. `upwork-job-actions.tsx` (HEAD BUG-11-08). |
| RQA-033 | S3 | `NEEDS_BROWSER` | Studio onboarding contrast. Code changed (HEAD BUG-12-03); contrast must be verified in light/dark/375px. |
| RQA-034 | S3 | `FIXED_AND_UNIT_VERIFIED` | Studio quality gate rejects leakage/markers/fabricated metrics. `daily-brief-engine.ts`; `tests/qa-relay-studio-quality.test.ts`. |
| RQA-035 | S4 | `FIXED_AND_UNIT_VERIFIED` | Copy confirmation. `post-editor-simple.tsx` (`copied` state). |
| RQA-036 | S1 | `NEEDS_BROWSER` | Studio image persistence. Code persists per post (HEAD BUG-11-14); S1 requires browser verification (generate → navigate → return → refresh). |
| RQA-037 | S3 | `NEEDS_VERIFICATION` | Voice calibration route. Settings page changed (HEAD BUG-12-01); route not re-verified. |
| RQA-038 | S3 | `NEEDS_BROWSER` | Pricing contrast. Code changed (HEAD BUG-12-05); needs visual check. |
| RQA-039 | S3 | `NEEDS_BROWSER` | Light-theme contrast. Code changed (HEAD BUG-11-09); needs visual check. |
| RQA-040 | S1 | `NEEDS_BROWSER` | Prospect draft/result persistence. Code persists to localStorage (HEAD BUG-13-01); S1 requires browser verification (refresh/navigate/back-forward). |
| RQA-041 | S3 | `FIXED_AND_UNIT_VERIFIED` | Intentional abort silent. `sse/client.ts` (HEAD BUG-13-03). |
| RQA-042 | S3 | `FIXED_AND_UNIT_VERIFIED` | SKIP footer copy derives from action. `prospect/page.tsx` (HEAD BUG-13-04). |
| RQA-043 | S3 | `FIXED_AND_UNIT_VERIFIED` | Prompt-instruction lines are neutralised and never credited as buyer evidence. `source-facts.ts` (`isInstructionLine`, `classifyLine`) + `buyer-intent.ts` (`usable`); test in `qa-rqa-sections-1-7.test.ts`. |
| RQA-044 | S3 | `FIXED_AND_UNIT_VERIFIED` | Seller grammar never a buyer request. `source-facts.ts`; `tests/qa-relay-s1-scoring.test.ts` (Daniel). |
| RQA-045 | S3 | `FIXED_AND_UNIT_VERIFIED` | Explicit SaaS-agency buyer is HIGH. `buyer-intent.ts`; `tests/qa-relay-s1-scoring.test.ts` (Emma). |
| RQA-046 | S1 | `NEEDS_BROWSER` | Explicit buyer never LOW/SKIP/UNKNOWN. `buyer-intent.ts`; `tests/qa-relay-s1-scoring.test.ts` (Hannah). S1 requires browser verification. |
| RQA-047 | S3 | `FIXED_AND_UNIT_VERIFIED` | Terminal do-not-contact overrides historical intent. `source-facts.ts` + `buyer-intent.ts`; `tests/qa-relay-s1-scoring.test.ts` (Ethan). |
| RQA-048 | S3 | `FIXED_AND_UNIT_VERIFIED` | Explicit dates parsed and separated from buyer timing. `source-facts.ts`; `tests/qa-relay-s1-scoring.test.ts`. |

### Summary (after Session 2)

- `FIXED_AND_UNIT_VERIFIED`: 34
- `NEEDS_BROWSER` / `NEEDS_VERIFICATION`: 8 (RQA-008, 033, 036, 037, 038, 039, 040, 046)
- `BLOCKED_WITH_EXACT_REASON`: 6 (RQA-001, 002, 005, 023, 024, 025)

No item is `FIXED_AND_BROWSER_VERIFIED`. Per the release rules, **the release
verdict remains NO-GO** on browser coverage alone.

---

## Session 1 — work performed

### Reproduced and fixed

1. **RQA-003** — LinkedIn chrome as role/company.
   - Root cause: `extractPersonSignals` picked the first line containing `·`/`-–` as the
     title, which is the connection badge "3rd · Connect"; `normalizeProspectPaste` did not
     strip degree+action lines.
   - Fix: `isLinkedInChromeLine` recognises `3rd · Connect`, `2. · Vernetzen`, `2nd • Message`;
     `extractPersonSignals` skips chrome/degree segments.
2. **RQA-004** — job-seeker text raised buyer contradictions.
   - Root cause: `ASK_PATTERNS` broad "looking for a …" matched "Looking for a remote frontend
     role"; `seekingVendor` matched the same; `hiring` matched "looking for".
   - Fix: `explicitAsk`, `hiring` and `seekingVendor` are now derived per-line and exclude
     job-seeking/seller/service/customer-discovery lines.
3. **RQA-006** — German budget label.
   - Root cause: `score-v3.ts` rendered `Budget stated: ${amount ?? 'stated'}`.
   - Fix: null amount → "Budget available — amount not stated".
4. **RQA-021** — freelancer offer not classified as service provider.
   - Root cause: `SELLER_GRAMMAR` did not match the apostrophe form "I'm a freelance …" nor
     "open to projects".
   - Fix: added apostrophe and "open to projects" seller patterns.
5. **RQA-026** — self-declared fake proof quoted.
   - Root cause: proof consumption did not distinguish approved-but-placeholder rows.
   - Fix: `isProductionSafeProof` gate (verified + no self-declared FAKE/TEST/DEMO/SAMPLE/
     EXAMPLE/PLACEHOLDER/REJECTED) applied in `matchProofToLead`, `strongestProof` and
     `classifyClaimSafety`.
6. **RQA-043** — prompt instruction quoted as buyer evidence.
   - Root cause: no instruction boundary; a meta-instruction carrying request wording could
     be read as a buyer request.
   - Fix: `isInstructionLine` neutralises "ignore previous instructions" and
     "give/score/classify this prospect … 100/100 / as a strong buyer" lines in `classifyLine`
     and excludes them from the buyer-intent reader.

### Tests added
- `tests/qa-rqa-sections-1-7.test.ts` (9 tests, all pass).

### Regression runs (this session)
- `tests/qa-rqa-sections-1-7.test.ts`: 9 pass.
- Broad set (intelligence, scoring, prospect, message/draft, profile, company, role,
  inbound, relay, golden, qa-relay-s1, qa-20-oct): **811 tests / 38 files, all pass**.
- `npx tsc --noEmit`: clean.

### Not changed
- No commit, no push, no migration, no unrelated file touched.
- Browser/E2E not run (no running app / credentials).

---

## Session 2 — work performed

Continued from the Session 1 tracker; did not restart the audit.

### Reproduced and fixed

1. **RQA-016 (class)** — browser routes authenticated with the service-role client.
   - Root cause: `createServiceSupabase()` carries no user session, so `auth.getUser()`
     returned null → false "Not signed in" for an authenticated rep.
   - Fix: `refresh-intelligence`, `signal-watch`, `reply-strategies`,
     `admin/rep-performance`, `admin/performance`, `admin/performance/config` now resolve
     the signed-in rep via `getAuthContext()`/`createScoutStore()`. Sweep test guards the
     whole API tree.
2. **RQA-012** — connection-note stream could end silently.
   - Root cause: `streamDraft`'s `needs_rescoring` path emitted no terminal `done`, and the
     client ignored `needs_rescoring` → blank note, no error.
   - Fix: `streamDraft` always ends terminally; the client surfaces `needs_rescoring` and
     any stream that ends without a terminal event.
3. **RQA-009/010/011** — the lead never rendered sender routing or mismatch actions.
   - Root cause: `decision-context` returned `routing`/`hasMismatch`/`routingRecommendation`
     but `LeadDecisionContextCard` rendered none of it.
   - Fix: new `SenderMatchCard` (ranked senders, current/best badges, reasons, holders) plus
     **Keep Current Owner**, **Refer** and **Ask for Help** wired to the existing
     `/refer` and `/help` APIs. Added `holderRepIds` to the ranking.
4. **RQA-019** — no manual archive/restore.
   - Fix: `POST /api/leads/[id]/archive` (soft archive/restore), a lead-detail
     Archive/Restore control, and an "Archived leads" section on `/archive` with Restore.
5. **RQA-013** — explicit positive buyer reply labelled `pricing · neutral`.
   - Root cause: `analyzeReply` checked the pricing keyword before interest/meeting cues.
   - Fix: buying confirmation and meeting-request cues now outrank a bare pricing keyword.
6. **RQA-015** — Won outcome missing from History.
   - Root cause: History rendered only messages; the outcome is an event.
   - Fix: `getLead` exposes `wonAt`/`lostAt`; the History tab renders an Outcome row.
7. **RQA-017/018** — manual lead creation gated and split-brained.
   - Fix: `manual` flag allows creation with name/company/title and no pasted source, left
     UNSCORED (no invented score); manual research is scored through the canonical pipeline
     so the overview and decision card agree.
8. **RQA-020** — inbound signature collapsed into the title.
   - Root cause: "– Jonas, CTO at Fenwick Pay" was not parsed; company became "Jona".
   - Fix: `lib/inbound/signature.ts` lifts the trailing signature into a profile block.

### Tests added
- `tests/qa-rqa-session2.test.ts` (RQA-012, 009/010/011, 013, 015, 017/018, 020).
- `tests/qa-rqa-session2-auth.test.ts` (RQA-016 class sweep).

### Regression runs (Session 2)
- Session-2 + conversation + parity + golden + qa-relay-s1 + qa-20-oct:
  **624 tests / 30 files, all pass**.
- Admin/dataset/security/messaging/intelligence/company/relay:
  **441 tests / 31 files, all pass**.
- Upwork/content/studio/relay/profile/dashboard/scoring/accountability/email/
  workspace/revenue/bd/prospect/lead/qa: **1141 tests / 77 files, all pass**.
- `npx tsc --noEmit`: clean.

### Not changed
- No commit, no push, no migration, no unrelated file touched.
- Browser/E2E not run (no running app / credentials).

---

## Next session — start here

1. Re-read this file and confirm HEAD.
2. Confirm deployed SHA matches tested source; if not, redeploy and record it.
3. Remaining blocked: RQA-001 (S2 mobile nav), RQA-023 (S3 range filters), RQA-024 (S4 perf
   nav), RQA-025 (S4 latency). Product/calibration decisions still open: RQA-002, RQA-005.
4. `NEEDS_VERIFICATION`: RQA-008 (exact Sophia parity), RQA-037 (voice calibration route).
5. S1 browser verification: RQA-036, RQA-040, RQA-046 (mandatory before GO).
6. UI/browser items: RQA-033, RQA-038, RQA-039 (contrast), plus the S1 batch.
7. Re-run the exact RQA-001 → RQA-048 acceptance steps after fixes; do not substitute fixtures.

## Current release verdict

**NO-GO.** S1 items are not browser-verified, deployed SHA parity is unconfirmed, and the
required browser/device matrix has not been run.

---

## Session 3 — REL-QA-001..010 closure (26 Oct 2026 program)

Branch `sprint-post-mvp-activation`. Baseline HEAD `8660e10dc0c3cac53114cfb5dba9bcb0e3cc582d`.

### Baseline (before changes)

| Field | Value |
| --- | --- |
| tsc --noEmit | clean |
| vitest | 6 failed / 3423 passed (228 files) |
| Pre-existing failures | `hardening-regression-avigail` (3), `hardening-regression-brian` (1), `hardening-regression-daria` (1), `hardening-regression-elijah` (1) |

The 6 failures are pre-existing and were NOT introduced by this session. They are
extraction/eligibility failures that need the AI provider and are out of scope for
the REL-QA-001..010 set. They are recorded here rather than hidden.

### Work performed

Each item is fixed at the canonical layer and carries a permanent regression test.

| Item | Root cause | Fix | Test |
| --- | --- | --- | --- |
| REL-QA-001 | `EXTERNAL_PROVIDER` regex did not allow "external software development company" | Allow up to three qualifiers between "external" and the provider noun (`source-facts.ts`) | `tests/qa-relay-rel-qa-001-explicit-buyer.test.ts` (13) — pre-existing from an earlier session |
| REL-QA-002 | Presence derived from raw `messages` rows; Archive/Conversation use `buildThread`, which also counts `lead.inboundMessage` | `deriveConversationPresence()` reads the canonical thread (`conversation-presence.ts`); `LeadTrustAndThesis` consumes it | `tests/qa-relay-rel-qa-002-conversation-presence.test.ts` |
| REL-QA-003 | Today card counted leads by stored `status`; sections counted canonical ranked actions | `deriveTodayCounts()` feeds the card; the desk sections read the same full action list | `tests/qa-relay-rel-qa-003-today-count-parity.test.ts` |
| REL-QA-004 | Same as REL-QA-003 (follow-ups keyed on `status='followed_up'` vs policy-derived list) | Same canonical selector | same test |
| REL-QA-005 | `SEND_REPLY` mapped to phase `replied` and rendered "Replied" while the rep owes a reply | `deriveRelationshipDisplayState()` maps the action to `NEEDS_REPLY` / "Needs reply"; `StatusPill` renders the canonical label | same test as REL-QA-002 |
| REL-QA-006 | My Numbers rendered the raw legacy 0–12 `leads.score` as "score N" | `leadScoreText()` renders the canonical `/10` (or names `/12`); accountability consumes it | `tests/qa-relay-rel-qa-006-score-parity.test.ts` |
| REL-QA-007 | Studio Regenerate silently replaced the existing image with a canvas fallback and persisted it | Failure classified (`image-failure.ts`); existing image kept; real reason + retry shown | `tests/qa-relay-rel-qa-007-image-regenerate-failure.test.ts` |
| REL-QA-008 | `sanitizeCompanyName` only stripped edge punctuation, so a sentence boundary inside the value survived | Cut at the sentence boundary; domain-style names preserved | `tests/qa-relay-rel-qa-008-company-boundary.test.ts` |
| REL-QA-009 | Reply generator had no question plan and no completeness gate | `buyer-questions.ts` extracts the plan, injects it into the prompt, and gates the draft on 100% coverage + no invented calendar slot | `tests/qa-relay-rel-qa-009-buyer-question-coverage.test.ts` |
| REL-QA-010 | Leads board said "No leads yet" when a filter/search matched none, despite leads existing | `resolveLeadsBoardEmptyState()` names the real state | `tests/qa-relay-rel-qa-010-empty-state.test.ts` |

Also carried through: `mapMessage` dropped the `thread_status` column, so presence could
never see verification state. Added `Message.threadStatus` + the mapping.

### Regression runs (this session)

- Full `vitest run`: **6 failed / 3472 passed (235 files)** — same 6 pre-existing failures, zero new.
- `npx tsc --noEmit`: clean.
- `eslint`: 0 errors.

### Risks

| Risk | Status |
| --- | --- |
| RISK-01 fake proof | Already gated by `isProductionSafeProof` (RQA-026). Not re-run this session. |
| RISK-03 workspace visibility | Leads page already scopes to the workspace profile and explains it. |
| RISK-04 sender duplicates | `SenderMatchCard` ranks by profile id; no name-only dedupe. |
| RISK-05 Upwork reset semantics | No "Clear source" / "Reset all" control exists in the Upwork flow. |
| RISK-06 mobile Feedback overlap | There is no floating Feedback widget in this codebase (only inline `ScoringFeedback`). |

### Not done in this session

- No browser / device matrix. No running app or production credentials.
- Deployed SHA parity unconfirmed (no Vercel CLI access).
- No cross-surface `assertLeadParity` suite (Phase 17) or named eval dataset (Phase 18).
- No security re-run (Phase 20) beyond the existing suite.
- The 6 pre-existing extraction failures are open.

**Verdict: NO-GO** — the fixes are unit-verified, but browser verification and the release
SHA gate have not been run.

---

## Session 4 — release-candidate pass (26 Oct 2026)

### Freeze + deploy

- Committed the REL-QA-001..010 closure as `ae652cb110bde4fc4184da58c52bfac866bf4418`.
- Deployed that exact tree as a **preview** (QA, not production):
  `https://bpule-relay-ql2lpe6ue-aneeb-iqbals-projects.vercel.app`
  (`dpl_4aKMmmSFTXPejWTDA5Cdk8k9hTC5`).
- **Deployed SHA verified at runtime** via `GET /api/version`:
  `{"sha":"ae652cb110bde4fc4184da58c52bfac866bf4418","ref":"sprint-post-mvp-activation","env":"preview"}`.
  Production `relay.bpulse.dev` is on `65b9f91` (`main`) — not this build.

### Release candidate (the SHA QA should test)

- Commit `bdf75f873e78bcd01db35ceebf4fff384bf0e8c0` ("test(relay): release candidate —
  parity suite, message-quality eval, close 6 pre-existing failures").
- Preview: `https://bpule-relay-c7da6ns8c-aneeb-iqbals-projects.vercel.app`
  (`dpl_AqimrUzFY7y5CihAHNsnyK8p8PHN`).
- **Runtime-verified**: `GET /api/version` →
  `{"sha":"bdf75f873e78bcd01db35ceebf4fff384bf0e8c0","env":"preview","appVersion":"0.8.0"}`.
- Smoke: `/`, `/login`, `/api/version` all `200`.

Production deploy is a separate, explicit step (promote this exact SHA) and has
**not** been done.

### Added

- `GET /api/version` already existed; extended with `appVersion`.
- **Cross-surface parity suite** — `src/lib/relay/lead-parity.ts` +
  `tests/qa-relay-cross-surface-parity.test.ts`. Computes every surface's view
  of one lead (score, qualification, action, pipeline stage, relationship display,
  conversation presence, thread) and reports divergence. Found and fixed a real
  gap: an inbound-first lead was filed as `to_contact` while the lead detail said
  `NEEDS_REPLY` (`derivePipelineStage` now treats inbound-first leads as a live
  conversation).
- **Named message-quality eval set** — `tests/qa-relay-message-quality-eval.test.ts`:
  paraphrases, compound asks, implicit asks, pricing and technical requirements.
  Broadened `extractExplicitBuyerQuestions` to split compound asks and read
  paraphrases/implicit asks.

### The 6 pre-existing failures — closed

| Fixture | Root cause | Resolution |
| --- | --- | --- |
| `hardening-regression-brian` / `-elijah` | `separateRoleFromEmployer` (added in `43363b3`) strips "at Company" from the title. The assertions expecting the company in the title predate the deliberate PRO-002 separation (`56ff43d`, newer) and contradict it. | Test assertions corrected to the deliberate role-only title; the company is still asserted separately. |
| `hardening-regression-avigail` (remote eligibility ×2) | The model extracted a bogus `job` from her headline ("CEO, Founder & Principal Interior Designer"), so the "no opportunity at all" guard did not fire and eligibility stayed UNCLEAR. | The guard now requires a *substantive* extracted job (skills/pay/date/source/employment type). A headline is not a job. |
| `hardening-regression-avigail` (message recommended) | `isHighPotentialBuilder` (added in `11f55cf`) recommends a connection note for any CEO/Founder title, including a non-software one. | The builder rule now requires a product business model or technical signal — "high potential builder" means a product builder. The 5 builder-connection tests still pass. |
| `hardening-regression-daria` (empty draft) | The test passed `strategy: null`, which is `streamDraft`'s legitimate "needs rescoring" path. | Test passes the derived strategy, as the real route does. |

### Regression runs (this session)

- Full `vitest run`: **237 files / 3498 tests, 0 failures.**
- `npx tsc --noEmit`: clean. `eslint`: 0 errors.

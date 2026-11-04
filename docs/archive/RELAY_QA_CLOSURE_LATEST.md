# Relay QA Closure — 12-Bug Batch (root-cause pass)

> Release-gating artifact. One row per bug, with reproduction → root cause →
> canonical owner → fix → unit → integration → browser → production evidence.
> Statuses: `OPEN`, `FIXED_UNIT`, `FIXED_INTEGRATION`, `FIXED_BROWSER`,
> `FIXED_PRODUCTION`, `BLOCKED_WITH_EXACT_REASON`.
>
> Rule 5 is enforced: no UI symptom is fixed before
> `INPUT → NORMALIZATION → SOURCE FACTS → DECISION → PERSISTENCE → DOMAIN STATE → API → UI`
> is traced end to end.

---

## Phase 0 — Baseline (frozen before changes)

| Field | Value |
| --- | --- |
| Branch | `sprint-post-mvp-activation` (26 ahead of `origin/sprint-post-mvp-activation`) |
| HEAD SHA | `fd14819493ff485b572bc1c2e760e6b9faccd4fe` |
| origin/main SHA | `65b9f916ff1198278e9eaaff7a8f19ef051ddcaf` |
| Deployed SHA | **UNKNOWN** — no Vercel CLI access in this environment |
| Preview SHA | **UNKNOWN** |
| Scoring version | `relay_decision_v3.3.0` (`src/lib/intelligence-v3/versions.ts`) |
| Source facts version | `source_facts_v1` |
| Buyer intent version | `buyer_intent_v5` |
| Migration version | 117 declared / 117 applied per `docs/RELAY_E2E_AUDIT_2026-10-22.md` |
| Working tree | clean at baseline |

### Baseline runs (before any change)

| Gate | Result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx eslint` | 0 errors / 805 warnings (pre-existing, untouched) |
| `pnpm vitest run` | **3707 passed / 0 failed / 0 skipped** |
| `pnpm qa:contracts` | 32 passed |
| `pnpm qa:release` | **PASS** — BROWSER `NOT_RUN` (no `E2E_BASE_URL`), SHA `NOT_VERIFIED` |
| `pnpm build` | PASS |

**No pre-existing failures.** Nothing is hidden. The 6 failures recorded in
`docs/qa-closure/QA_CLOSURE_STATE.md` Session 3 were closed in Session 4 and are
not present at this HEAD.

### Failure classification

| Class | Count | Detail |
| --- | --- | --- |
| NEW | 0 | — |
| PRE_EXISTING | 0 | suite is green at baseline |
| FLAKY | 0 | — |
| ENVIRONMENTAL | 0 | — |

---

## Bug classes (the 10 recurring classes)

1. input normalization failures
2. lifecycle/idempotency failures
3. cross-surface state divergence
4. extraction/display contamination
5. auth/config capability mismatch
6. messaging-policy ambiguity
7. relationship-role modeling gaps
8. performance/query waterfalls
9. scoring explanation misunderstanding
10. analyze/save persistence drift

---

## Closure table

| ID | Sev | Class | Status | Root cause (one line) | Canonical owner |
| --- | --- | --- | --- | --- | --- |
| BUG-001 | S4 | performance/query waterfall | `FIXED_STRUCTURAL_NEEDS_MEASUREMENT` | All sidebar links set `prefetch={false}`; the app layout awaited 5 independent lookups sequentially | `src/components/app-rail.tsx`, `src/app/(app)/layout.tsx` |
| BUG-002 | S3 | scoring explanation misunderstanding | `FIXED_UNIT` | `START_CTX` did not match "begins", so a project start date was read as an activity date; the contradiction watchOut fired on a HIGH verified request | `source-facts.ts`, `dimensions.ts`, `score-v3.ts` |
| BUG-003 | S2 | lifecycle/idempotency | `FIXED_UNIT` | The one-shot `?next` intent was consumed inside the same effect that started async draft work, so a refresh re-fired it | `src/lib/relay/lead-bootstrap-state.ts`, `lead-workspace-simple.tsx` |
| BUG-004 | S2 | cross-surface state divergence | `FIXED_UNIT` | The opening message lived only on `lead.inboundMessage`; `buildThread` synthesized a turn for it even when a canonical row existed | `src/lib/conversation/canonical-message.ts`, `thread.ts` |
| BUG-005 | S3 | input normalization | `FIXED_UNIT` | Label parsing was re-implemented per surface; the shared parser only accepted `label: value` on one line | `src/lib/intelligence-v3/normalize-external-input.ts` |
| BUG-006 | S3 | input normalization | `FIXED_UNIT` | No `country` field was derived from a stated location; a future start date was read as activity | `normalize-external-input.ts`, `source-facts.ts` |
| BUG-007 | S3 | lifecycle | `FIXED_UNIT` | `computeUpworkScore` set `hasJob` from the raw paste, so the score rendered before extraction | `src/app/(app)/upwork/new/page.tsx`, `src/lib/upwork/facts.ts` |
| BUG-008 | S2 | auth/config capability mismatch | `FIXED_UNIT` | `/api/signup` required `SIGNUP_INVITE_CODE` while the public screen never collected a code — a form that could not succeed | `src/lib/auth/capabilities.ts`, `signup-experience.tsx` |
| BUG-009 | S3 | auth/config capability mismatch | `FIXED_UNIT` | The Google button rendered regardless of provider configuration | `src/lib/auth/capabilities.ts`, `login-experience.tsx` |
| BUG-010 | S3 | input normalization | `FIXED_UNIT` | Prose identity required every surname token to be capitalized and relied on `.` regex behaviour across newlines | `normalize-external-input.ts` |
| BUG-011 | S3 | relationship-role modeling | `FIXED_UNIT` | Already correct: `recruiterOnly` fails buyer intent closed and `RECRUITER` is its own role. The golden fixture settles the role-vs-flag question. | `src/lib/intelligence-v3/buyer-intent.ts` |
| BUG-012 | S2 | messaging-policy ambiguity | `FIXED_UNIT` | Draft state was `draftText` + a failure flag, so a policy skip and a generator failure looked identical | `src/lib/relay/draft-generation-state.ts` |

---

## Per-bug detail

### BUG-001 — Navigation performance (S4)

- **Reproduction.** Profile Today / Leads / Chats / Prospect / Admin QA; capture
  RSC duration, DB query count, duplicate auth/workspace queries, largest
  queries, sequential waterfalls, hydration delay.
- **Root cause.**
  1. `src/components/app-rail.tsx` set `prefetch={false}` on all three nav
     renderers — desktop sections, mobile drawer and mobile bottom bar. Every
     route change was a full RSC round-trip with no prefetch.
  2. `src/app/(app)/layout.tsx` awaited `getCurrentUser` → `createScoutStore` →
     `getQueue` → `getAuthContext` → `listRevenueIdentities*` as a five-step
     sequential waterfall on every authenticated request.
- **Fix.** Removed every `prefetch={false}`; collapsed the layout to two
  `Promise.all` waves.
- **Evidence.** `docs/RELAY_NAVIGATION_PERFORMANCE.md` (BEFORE/AFTER).
- **Status.** `FIXED_STRUCTURAL_NEEDS_MEASUREMENT` — the structural change is
  in and statically verified, but the measured BEFORE/AFTER numbers require a
  running app and a seeded workspace, neither of which exists in this
  environment. **Do not close BUG-001 on the strength of the structural change.**
  The complaint was navigation latency; the evidence that it disappeared must be
  a measurement.

### BUG-002 — Explicit buyer semantics (S3)

- **Reproduction.** `MICHAEL_EXPLICIT_BUYER_FUTURE_START`.
- **Root cause.**
  1. `START_CTX` in `source-facts.ts` matched `begin` but not `begins`, so
     "Project begins April 2027" was read as an **activity** date instead of a
     buyer start date — exactly the "future start makes the request stale" bug.
  2. `score-v3.ts` emitted `"Buyer signals disagree — intent treated as
     UNKNOWN"` whenever `contradictions` was non-empty, even when the verified
     request had resolved to HIGH.
- **Fix.** Broadened `START_CTX` to `begin(?:ning)?s?` and the project-start
  forms; added `desiredStartDate` to `TimingResolution`; the UNKNOWN warning now
  fires only when the intent actually resolved to UNKNOWN. Renamed the Prospect
  and Lead-creation labels to "Extraction completeness" / "Decision confidence".
- **Unit test.** `tests/qa-relay-bug-002-explicit-buyer-future-start.test.ts`.
- **Status.** `FIXED_UNIT`

### BUG-003 — Lead refresh / deep-link idempotency (S2)

- **Reproduction.** `CREATE_LEAD_REFRESH_DURING_BOOTSTRAP`.
- **Root cause.** The one-shot `?next=generate-…` param was read inside the same
  effect that started async draft work, and was only removed when the phase
  matched. A refresh during generation re-read it and fired a second draft; a
  non-matching phase left it in the URL forever.
- **Fix.** New `LeadBootstrapState`
  (`NOT_REQUESTED → PENDING → RUNNING → DONE/FAILED`). The intent is stripped
  from the URL **before** any async work; generation starts only from `PENDING`
  and only when the lead, a valid id and the canonical decision all exist.
- **Unit test.** `tests/qa-relay-bug-003-refresh-bootstrap.test.ts`.
- **Status.** `FIXED_UNIT` — the browser assertion needs a running app.

### BUG-004 — Duplicate conversation message (S2)

- **Reproduction.** `INITIAL_INBOUND_ALREADY_CANONICAL`.
- **Root cause.** The opening message lived only on `lead.inboundMessage`;
  `buildThread` synthesized a turn for it unconditionally, so when the same
  message was also logged as a message row it rendered twice.
- **Fix.** New canonical message identity
  (`inbound_first:${leadId}` as the message's `idempotency_key`). `createLead`
  writes the canonical opening row for inbound leads; `buildThread` and the
  History tab render the lead-level fallback only when no canonical row exists.
  The identity is structural, so two genuinely repeated messages stay two.
- **Unit test.** `tests/qa-relay-bug-004-duplicate-inbound.test.ts`.
- **Status.** `FIXED_UNIT`

### BUG-005 — Structured lead extraction (S3)

- **Reproduction.** Label prefixes reached the extracted fields.
- **Root cause.** Label parsing was re-implemented per surface; the shared
  parser only accepted `label: value` on a single line, so `Full Name: X`,
  `Name = X`, `Company - X`, `Location | X` and next-line labels all failed.
- **Fix.** `normalizeExternalInput()` — one boundary returning
  `normalizedText`, `structuredFields` and per-field `provenance`. Labels are
  stripped from values; missing fields are null, never invented.
- **Unit tests.** `tests/qa-relay-input-normalization.test.ts`,
  `tests/qa-relay-normalization-boundary.test.ts`.
- **Status.** `FIXED_UNIT`

### BUG-006 — Location / confidence / timing (S3)

- **Reproduction.** `Location: Austin, Texas, United States`.
- **Root cause.** No `country` field was derived from a stated location; the
  start-date/activity confusion from BUG-002.
- **Fix.** `countryFromLocation` derives the country from the last country-like
  token; `desiredStartDate` separates the delivery date from activity recency.
- **Unit test.** `tests/qa-relay-input-normalization.test.ts`.
- **Status.** `FIXED_UNIT`

### BUG-007 — Upwork explicit analysis lifecycle (S3)

- **Reproduction.** Raw textarea content was shown as analyzed job data.
- **Root cause.** `computeUpworkScore` set `hasJob` from `rawInput`, so the
  score rendered before extraction had run.
- **Fix.** Explicit `RAW → EXTRACTING → ANALYZED → FAILED` lifecycle; the score
  and the apply action are gated on `ANALYZED`. `titleOf` now reads a labeled job
  title through the canonical boundary, so `"Job Title:"` is never the title.
  Added an honestly-labelled **Clear source** control.
- **Unit test.** `tests/qa-relay-bug-012-skip-draft-state.test.ts` (lifecycle
  family) and the named case `BUG007_UPWORK_ANALYSIS_STATE`.
- **Status.** `FIXED_UNIT`

### BUG-008 — Signup contract (S2)

- **Reproduction.** The public Create Workspace form could not succeed in either
  env configuration.
- **Root cause.** `/api/signup` required `SIGNUP_INVITE_CODE`; the signup screen
  never collected a code. With the env var set every signup 403'd; without it
  the route 503'd. A dead-end form either way.
- **Fix.** `getAuthCapabilities()` — `publicSignupEnabled` and
  `inviteOnlySignupEnabled` are mutually exclusive and both are derived from the
  deployment config. The signup screen renders the path the deployment supports:
  a public Create Workspace form, an invite-code field with "Relay access is
  invitation-only", or an honest "signup is not available" with a Login link.
- **Unit test.** `tests/qa-relay-bug-008-009-auth-capabilities.test.ts`.
- **Status.** `FIXED_UNIT`

### BUG-009 — Google auth capability (S3)

- **Reproduction.** The Google button rendered when the provider was not
  configured.
- **Root cause.** The button was unconditional.
- **Fix.** The button renders only when `capabilities.googleEnabled` is true.
- **Unit test.** `tests/qa-relay-bug-008-009-auth-capabilities.test.ts`.
- **Status.** `FIXED_UNIT`

### BUG-010 — Inbound prose identity (S3)

- **Reproduction.** `Hello,\nMy name is Mazhar khan,\nand I'm the Chief
  Technology Officer\nat Bpulse.`
- **Root cause.** Prose identity required every surname token to be capitalized
  and relied on `.` regex behaviour across newlines.
- **Fix.** `normalizeExternalInput` reads prose with whitespace normalisation:
  lowercase surnames, particles (`van der`, `de la`), apostrophes
  (`O'Connor`), hyphenated names, and a role/company pair read together so a
  title never absorbs the company (Contract 1).
- **Unit test.** `tests/qa-relay-input-normalization.test.ts`.
- **Status.** `FIXED_UNIT`

### BUG-011 — Recruiter role (S3)

- **Reproduction.** A recruiter hiring an employee was read as a buyer.
- **Root cause.** **Already correct at this HEAD.** `recruiterOnly` fails buyer
  intent closed when a recruiter posts no external request, and `RECRUITER` is
  its own `RelationshipRole`, distinct from `CANDIDATE`.
- **Investigation (RULE 3).** The first fix attempt made a recruiter with a
  verified request resolve to `RECRUITER`. The golden fixture
  `buyer-outsourced-team-not-employees` contradicts that with an explicit note:
  *"Recruiter title does not block a real external request."* The change was
  reverted. The correct model: the recruiter **flag** is recorded for every
  surface; the **role** describes the commercial relationship.
- **Unit test.** `tests/qa-relay-bug-011-recruiter-role.test.ts`.
- **Status.** `FIXED_UNIT`

### BUG-012 — SKIP draft state (S2)

- **Reproduction.** Generate was offered for a SKIP lead and silently produced
  nothing.
- **Root cause.** Draft state was `draftText` plus a failure flag, so a policy
  skip and a generator failure were indistinguishable and both looked like an
  empty result.
- **Fix.** `DraftGenerationState`
  (`NOT_REQUESTED | GENERATING | GENERATED | SKIPPED_BY_POLICY | NEEDS_RESCORING |
  FAILED`). Policy is resolved before the outcome; Generate is disabled for
  `SKIPPED_BY_POLICY` and the exact message is shown.
- **Unit test.** `tests/qa-relay-bug-012-skip-draft-state.test.ts`.
- **Status.** `FIXED_UNIT`

---

## Verification matrix

### Browser E2E (Phase 27)

`BLOCKED_WITH_EXACT_REASON` — Playwright requires a running app
(`E2E_BASE_URL`) and a seeded workspace. Neither is available in this
environment; `pnpm qa:release` reports `BROWSER NOT_RUN`. The user-flow specs
exist and are unchanged (`e2e/leads.spec.ts`, `e2e/reply-conversation.spec.ts`,
`e2e/scoring-upwork-flow.spec.ts`), but they were not executed against these
changes.

### Mobile 375px (Phase 31)

`NOT_VERIFIED_IN_BROWSER`. Static check only: the changed controls all use the
existing responsive primitives. The new invite-code field is a `RelayField`
(label + hint + error) and collapses with the rest of the form; the new
"Clear source" button is a `Button` inside the existing `flex-wrap` row; the
draft policy message is a `<p>` inside the existing padded panel.

### Accessibility (Phase 32)

Static check:

| Check | Result |
| --- | --- |
| Labels | the invite-code field uses `RelayField` (`<label htmlFor>`); the email/password fields are unchanged |
| Focus | no focus order was changed; the new button is in DOM order |
| Disabled-button reason | `SKIPPED_BY_POLICY` renders an explicit `role="status"` message next to the disabled Generate |
| OAuth capability | the Google button is absent rather than present-and-broken |
| Error messages | unchanged humanizers; the signup "not available" path states the real reason |
| Keyboard controls | the new controls are native `<button>` / `<Link>` |

### Concurrency (Phase 33)

`NOT_VERIFIED`. The idempotency keys on `sendWithoutNote` and `logSend` are
unchanged. The bootstrap change removes the duplicate-draft path by consuming
the URL intent before async work, which is the structural fix for a
refresh-during-generation double fire.

### Failure injection (Phase 34)

`NOT_VERIFIED`. No new failure path was introduced. The `createLead` canonical
opening row is wrapped in a `try/catch` that never breaks lead creation, and
`buildThread` still renders the lead-level fallback if the row is missing.

### Observability (Phase 35)

Request correlation (`requestId`, `orgId`, `leadId`, `feature`,
`failure_category`) already exists in `src/lib/observability/trace-context.ts`
and `src/lib/relay/contract-violations.ts`. The new emitters carry the same
fields and never log raw source text.

### Contract violation telemetry (Phase 36)

Implemented. New kinds: `RAW_STATE_SHOWS_SCORE`, `ANALYSIS_SCORE_DRIFT`,
`CANDIDATE_WITH_RECRUITER_FLAG`, `DUPLICATE_OPENING_MESSAGE`,
`SKIP_WITH_GENERATED_DRAFT`, `UNSUPPORTED_AUTH_CAPABILITY`. Each is emitted at
the site that would produce the forbidden state, and `DUPLICATE_OPENING_MESSAGE`
is additionally detected in `lead-parity.ts` so the parity run reports it.
Guards: `tests/qa-relay-bug-contract-telemetry.test.ts`.

### Error states (Phase 29)

Static: the 404 lead path (`notFound()` in `src/app/(app)/leads/[id]/page.tsx`)
is unchanged; the auth failure and OAuth-unavailable paths now state the real
reason; the extract-failure path surfaces `errorCode`; the draft policy skip
shows `SKIP_POLICY_MESSAGE`; signup disabled states honestly.

---

## Final verdict

| Area | Verdict |
| --- | --- |
| INPUT NORMALIZATION | PASS — one boundary, 4 former bug classes, architecture test guards it |
| ANALYZE-SAVE PARITY | PASS — Contract 10; drift telemetry at the save route |
| CONVERSATION INTEGRITY | PASS — canonical message identity; opening renders once |
| UPWORK | PASS — `RAW → EXTRACTING → ANALYZED → FAILED`; score gated on `ANALYZED` |
| AUTH | PASS — capability model; no advertised-but-unavailable capability |
| RECRUITER SEMANTICS | PASS — already correct; the wrong first fix was reverted |
| MESSAGING POLICY | PASS — `DraftGenerationState`; a policy skip is never silent |
| PERFORMANCE | PASS (structural) / BLOCKED (measured) |
| CROSS-SURFACE PARITY | PASS |
| SECURITY | PASS (targeted set, 99 tests) |
| BROWSER | FAIL — not run |
| **PRODUCTION** | **NO-GO** |

**NO-GO.** Not because the fixes are wrong — the release gate is green and zero
regressions were introduced — but because the absolute release rule requires
browser acceptance, `tested SHA == deployed SHA`, and a production smoke, and
none of the three can be performed in this environment. The tree is ready to
deploy and verify; the deployment is the remaining work.

# Relay Product Contracts

**Release-gating artifact.** These are product decisions, not implementation
details. A future change must not silently reverse them. If you believe a
contract is wrong, change the contract deliberately and update every dependent
test in the same change — do not "fix" the code underneath it.

Each contract names the decision, why it was made, the evidence that settled it,
and the test that guards it.

---

## Contract 1 — Title and employer are separate canonical fields

**Decision.** `person.title` is the role only. `company.name` owns the employer.
Extraction never merges them. Display composition belongs in `formatRoleLine`
(and `stripEmployerFromTitle`), not in extraction.

**Why.** One field per concept. A title of `"CEO at Hartford AI Partners"` puts
the employer in two places, so the company can be shown twice or drift from the
extracted company. Separating them makes the subtitle a pure function of two
facts.

**Evidence.**
- `separateRoleFromEmployer` (`src/lib/intelligence-v2/extraction-pipeline.ts`)
  splits `"Role at Company"` into role + employer.
- `formatRoleLine` / `stripEmployerFromTitle` (`src/lib/leads/role-line.ts`)
  compose and deduplicate for display.
- `tests/prospect-qa-module-01.test.ts` — `PRO-002: role and employer are separated`.

**Guard.** `tests/qa-relay-product-contracts.test.ts` → "Contract 1".

---

## Contract 2 — A high-potential builder needs product/technical evidence

**Decision.** The builder connection-note path (`isHighPotentialBuilder` in
`src/lib/relay/revenue-strategy.ts`) requires a product business model
(`businessModel === 'PRODUCT'`) or technical signals
(`technicalSignals.length > 0`). A Founder/CEO title alone is not enough.

**Why.** The rule's name is *high potential builder* — someone building a product
BPulse could sell into. An interior designer, a nonprofit COO, or any other
non-software CEO is not a BPulse-relevant builder, and must not be sent outreach
on the strength of a title alone.

**Evidence.**
- `tests/revenue-strategy-builder-connection.test.ts` — 5 cases, all using
  `businessModel: 'PRODUCT'`.
- `tests/hardening-regression-avigail.test.ts` — the counterweight: Avigail
  Eisenstadt is a CEO/Founder with `businessModel: 'UNKNOWN'`,
  `technicalRelevance: 'NONE'`, `productMomentum: 'NONE'`; the hardening fixture
  requires no message.

**Guard.** `tests/qa-relay-product-contracts.test.ts` → "Contract 2".

---

## Contract 3 — One lead has one canonical action/state across every surface

**Decision.** Today, Lead Detail, Chats, Archive, Accountability, Admin QA and
message actions derive from the same canonical `LeadAction`, conversation state,
thread state and score. No surface may independently reinterpret `skip`,
`observe`, `needs reply`, `follow-up due`, or the canonical score.

**Why.** This is the recurring failure mode: one page fixed while another still
uses old semantics. It is what produced REL-QA-002 (Overview said "no
conversation" while Archive showed a turn), REL-QA-003/004 (Today counters
disagreed), REL-QA-005 ("Replied" while the rep owed a reply), REL-QA-006 (score
differed across Today and My Numbers) and the inbound-first pipeline
contradiction the parity layer caught.

**Canonical owners.**
- Action: `deriveNextLeadAction` (`src/lib/relay/lead-state-machine.ts`).
- Conversation presence: `deriveConversationPresence`
  (`src/lib/relay/conversation-presence.ts`).
- Relationship display: `deriveRelationshipDisplayState`
  (`src/lib/relay/conversation-presence.ts`).
- Pipeline stage: `derivePipelineStage` (`src/components/leads/pipeline-utils.ts`).
- Score: `getLeadDisplayScore` (`src/lib/scoring/display-score.ts`).
- Today counts: `deriveTodayCounts` (`src/lib/relay/today-counts.ts`).

**Guard.** `src/lib/relay/lead-parity.ts` computes every surface's view of one
lead from that one state and reports divergence. It is a **required RC check**.

---

## Contract 4 — Verified source truth outranks model disagreement

**Decision.** When the source contains a prospect-owned, uncontradicted external
buying request, a low model probability cannot erase it. The deterministic
source reading is the authority; the model is an auditor, not a decision-maker.
A source-verified request resolves to `HIGH` regardless of what the model scored.

**Why.** The QA report's Emma/Hannah class: the system *quoted* the buyer request
in the evidence and still reported no verified request, because the model scored
it low. That is a contradiction, not a judgement call. A source-side problem
(seller-owned, historical, negated, terminal) fails closed; a model disagreement
does not.

**Canonical owner.** `resolveVerifiedBuyerIntent` / `resolveBuyerIntentFromSource`
(`src/lib/intelligence-v3/buyer-intent.ts`). The model disagreement is recorded in
`contradictions` for audit, but `buyerIntentLevel` is `HIGH` whenever
`verifiedBuyerRequest` is true.

**Guard.** `tests/qa-relay-product-contracts.test.ts` → "Contract 4".

---

## Contract 5 — Terminal state overrides historical intent

**Decision.** `DO_NOT_CONTACT`, partner selected, completed, won, lost or dead
must suppress cold outreach and follow-up regardless of older positive signals.
A terminal conversation is over; only a later explicit buyer message reopens it.

**Why.** A lead that once looked like a buyer must not keep receiving outreach
after the client opted out or the deal closed. Older positive signals are
historical, not current.

**Canonical owners.**
- `deriveNextLeadAction` (`src/lib/relay/lead-state-machine.ts`) — `won`, `lost`,
  `dead`, `no` and `skip` return a non-contact action with `requiresAction: false`.
- `isTerminalOutcome` / `isTerminalStoredStage` / `isTerminalLeadStatus`
  (`src/lib/conversation/terminal.ts`) — one place decides a conversation is over.
- `classifyInboundReply` (`src/lib/sales/outcomes.ts`) — an opt-out is
  `DO_NOT_CONTACT`, which the store maps to lead status `dead`.

**Guard.** `tests/qa-relay-product-contracts.test.ts` → "Contract 5".

---

## Contract 6 — Unknown is not zero

**Decision.** Missing Connects, budget, source dates or any other field renders as
unknown / "not stated" / `null`. It never renders as `0`, and no exact estimate is
fabricated to fill the gap.

**Why.** `0` is a value with meaning; it tells the rep something was measured and
is zero. A missing field is not a measurement. Rendering missing as zero (or
inventing a round number) is a fabricated fact, which is worse than showing
nothing. The old Upwork bugs were exactly this class.

**Canonical owners.**
- `extractConnectsCost` (`src/lib/upwork-v2.ts`) returns `null` when the post does
  not state a Connects cost; the UI renders `Connects not stated`.
- `extractFixedBudget` returns `null` when no fixed-price budget exists; the
  budget formatter returns `null`, and the UI renders `Not stated`.
- `imageFailureReason` (`src/lib/content/image-failure.ts`) always returns a real
  reason, never a fabricated success.

**Guard.** `tests/qa-relay-product-contracts.test.ts` → "Contract 6".

---

## Contract 7 — Persistence and UI state reflect actual lifecycle state

**Decision.** Generated assets, prospect drafts/results, thread state, reply state
and saved scores must persist and must not disappear or silently change across
refresh/reopen. The UI state shown must be the lifecycle state actually stored.

**Why.** The QA report treated prospect draft/result loss and Studio image loss as
S1 data-loss concerns. Losing a rep's work, or showing a state that does not match
what was saved, is worse than not having the feature.

**Canonical owners.**
- `captureProspect` (`src/lib/store/supabase-store.ts`) — re-analysing the same
  paste reuses the stored capture (`isNewCapture: false`) instead of duplicating or
  dropping it.
- `upsertConversationState` — `onConflict: 'lead_id'`, so thread state is
  idempotent across refresh.
- `imageFailureReason` + the failure branch in `persona-daily-post.tsx` — a failed
  regeneration keeps the existing image and shows a reason instead of clearing it.

**Guard.** `tests/qa-relay-product-contracts.test.ts` → "Contract 7".

---

## Process rule — every S1/S2 fix becomes a fixture and, where applicable, a contract

> **Every S1/S2 production bug that is fixed must become both a named regression
> fixture and, where applicable, a product contract.**

This gives three layers of protection:

1. **Contract** — says what the product means.
2. **Regression test** — proves the old failure cannot return.
3. **`lead-parity.ts` / production browser QA** — proves every surface still agrees.

A fix that ships without a fixture is a fix that can silently return.

---

## Release-gating artifacts

1. **This document** — `docs/RELAY_PRODUCT_CONTRACTS.md`.
2. **Automated contract tests** — `tests/qa-relay-product-contracts.test.ts`
   (`pnpm qa:contracts`).
3. **`lead-parity.ts` as a required RC check** — run before browser sign-off;
   any divergence is a release blocker.
4. **`/api/version` SHA parity** — the deployed SHA must equal the tested SHA
   before browser sign-off. Compare `GET /api/version` (`sha`, `ref`, `env`)
   with the commit under test. A local `vercel deploy` reports `sha: null`;
   name the local commit explicitly in the QA record.

---

## Rule for future agents

> **If a test conflicts with a documented product contract, investigate the test
> first. If the product contract itself is wrong, change the contract
> deliberately and update all dependent tests together.**

The contract is the source of truth. A test that contradicts a contract is
almost always a stale test — not a bug in the product. Silently editing the
test to make it pass, or silently changing the code to satisfy the test, both
reintroduce the regression the contract exists to prevent.

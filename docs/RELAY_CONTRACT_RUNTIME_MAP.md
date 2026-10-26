# Relay Contract Runtime Map

**Release-gating artifact.** Every contract in `docs/RELAY_PRODUCT_CONTRACTS.md`
mapped to the code that owns it, the code that consumes it, and the tests that
guard it. The rule this map enforces:

> **No hidden secondary implementation.** Every consumer of a contract must read
> the canonical owner. A consumer that re-derives the value is a defect.

Generated and maintained by hand; `scripts/qa/contract-coverage.ts` reads it to
report coverage.

---

## Contract 1 — Title and employer are separate canonical fields

**Canonical owner**
- `separateRoleFromEmployer` — `src/lib/intelligence-v2/extraction-pipeline.ts`
- `formatRoleLine` / `stripEmployerFromTitle` — `src/lib/leads/role-line.ts`

**Runtime consumers**
- `src/lib/intelligence-v3/bridge.ts` (V3 projection of person/company)
- `src/components/lead-workspace-simple.tsx` (subtitle)
- `src/lib/leads/role-line.ts` (display composition)

**Tests**
- `tests/qa-relay-product-contracts.test.ts` → "Contract 1"
- `tests/prospect-qa-module-01.test.ts` → `PRO-002`

---

## Contract 2 — A high-potential builder needs product/technical evidence

**Canonical owner**
- `isHighPotentialBuilder` (internal) — `src/lib/relay/revenue-strategy.ts`, reached through `decideContact`

**Runtime consumers**
- `src/lib/relay/revenue-strategy.ts` (`contactDecision`, the only caller)
- `src/lib/ai/draft.ts`, `src/lib/ai/draft-stream.ts` (read `contact.messageRecommended`)

**Tests**
- `tests/qa-relay-product-contracts.test.ts` → "Contract 2"
- `tests/revenue-strategy-builder-connection.test.ts`
- `tests/hardening-regression-avigail.test.ts` (counterweight)

---

## Contract 3 — One lead has one canonical action/state across every surface

**Canonical owners**
| Concern | Owner | File |
| --- | --- | --- |
| Action | `deriveNextLeadAction` | `src/lib/relay/lead-state-machine.ts` |
| Conversation presence | `deriveConversationPresence` | `src/lib/relay/conversation-presence.ts` |
| Relationship display | `deriveRelationshipDisplayState` | `src/lib/relay/conversation-presence.ts` |
| Pipeline stage | `derivePipelineStage` | `src/components/leads/pipeline-utils.ts` |
| Score | `getLeadDisplayScore` | `src/lib/scoring/display-score.ts` |
| Today counts | `deriveTodayCounts` | `src/lib/relay/today-counts.ts` |

**Runtime consumers**
- Action: `src/components/lead-workspace-simple.tsx`, `src/lib/relay/relationship-state.ts`, `src/lib/relay/next-best-action.ts`, `src/lib/conversation/{inbox,archive,service}.ts`
- Presence: `src/components/leads/lead-trust-and-thesis.tsx`
- Pipeline stage: `src/components/leads/leads-board-v2.tsx`, `src/lib/analytics/pipeline-analytics.ts`
- Score: `src/app/api/prospect/save/route.ts`, `src/components/{score-ring,lead-workspace-simple}.tsx`, `src/components/rep/bd-daily-desk.tsx`, `src/components/account/account-360-view.tsx`, `src/lib/accountability/metrics.ts`, `src/lib/analytics/pipeline-analytics.ts`
- Today counts: `src/app/(app)/dashboard/page.tsx`
- Parity (required RC check): `src/lib/relay/lead-parity.ts`

**Tests**
- `tests/qa-relay-product-contracts.test.ts` → "Contract 3"
- `tests/qa-relay-cross-surface-parity.test.ts`
- `tests/qa-relay-rel-qa-002..006` fixtures

---

## Contract 4 — Verified source truth outranks model disagreement

**Canonical owner**
- `resolveVerifiedBuyerIntent` / `resolveBuyerIntentFromSource` — `src/lib/intelligence-v3/buyer-intent.ts`

**Runtime consumers**
- `src/lib/intelligence-v3/bridge.ts`, the V3 decision packet, and `src/app/api/prospect/analyze/route.ts`
- Scorers read `effectiveBuyerProbability` / `effectiveExternalNeedProbability`

**Tests**
- `tests/qa-relay-product-contracts.test.ts` → "Contract 4"
- `tests/buyer-intent-authority.test.ts`
- `tests/qa-2026-10-17/bug-buyer-001-service-offering.test.ts`

---

## Contract 5 — Terminal state overrides historical intent

**Canonical owners**
- `deriveNextLeadAction` — `src/lib/relay/lead-state-machine.ts`
- `isTerminalOutcome` / `isTerminalStoredStage` / `isTerminalLeadStatus` — `src/lib/conversation/terminal.ts`
- `classifyInboundReply` — `src/lib/sales/outcomes.ts`

**Runtime consumers**
- Follow-up queue, send path, action policy (all read `src/lib/conversation/terminal.ts`)
- `src/lib/conversation/follow-up-policy.ts` (`TERMINAL_OUTCOMES`)
- `src/lib/store/supabase-store.ts` (`DO_NOT_CONTACT` → lead status `dead`)

**Tests**
- `tests/qa-relay-product-contracts.test.ts` → "Contract 5"
- `tests/qa-relay-rel-qa-002`, `tests/lead-connection-lock.test.ts`

---

## Contract 6 — Unknown is not zero

**Canonical owners**
- `extractConnectsCost` / `extractFixedBudget` — `src/lib/upwork-v2.ts` (return `null`)
- `imageFailureReason` — `src/lib/content/image-failure.ts` (never fabricates)

**Runtime consumers**
- `src/app/(app)/upwork/[id]/page.tsx` (renders `Connects not stated` / `Not stated`)
- `src/components/relay/persona-daily-post.tsx` (failure banner)

**Tests**
- `tests/qa-relay-product-contracts.test.ts` → "Contract 6" (deterministic, mocked provider)
- `tests/upwork-extraction-backfill.test.ts`

---

## Contract 7 — Persistence and UI state reflect actual lifecycle state

**Canonical owners**
- `captureProspect` — `src/lib/store/supabase-store.ts` (reuse, `isNewCapture`)
- `upsertConversationState` — `onConflict: 'lead_id'`
- `imageRegenerationOutcome` — `src/lib/content/image-failure.ts`

**Runtime consumers**
- `src/components/relay/persona-daily-post.tsx` (regenerate)
- `src/app/api/prospect/save/route.ts` (capture)
- `src/lib/conversation/service.ts` (thread state)

**Tests**
- `tests/qa-relay-product-contracts.test.ts` → "Contract 7"
- `tests/qa-relay-rel-qa-007-image-regenerate-failure.test.ts`
- `tests/log-sent-idempotency.test.ts`, `tests/inbound-analysis-race.test.ts`

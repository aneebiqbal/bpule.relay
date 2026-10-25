# Relay — Post-MVP Revenue Stability + Sales OS Program — Status

**Date:** 2026-10-24 · **Scope this session:** Sprint A (Safety) · **Full program:** 20 phases / 6 sprints
**Companion audit:** `docs/RELAY_AUDIT_2026-10-24.md` · **Route map:** `docs/RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md` · **PII plan:** `docs/PII_GIT_REMEDIATION.md`

> This is a **multi-session program**. This session implemented Sprint A only, per the "do not jump to Sprint F" rule. Nothing in Sprint B–F is claimed done.

---

## EXECUTIVE SUMMARY

Sprint A (Safety) is implemented and unit-verified. The four things that could cause real harm to a prospect or a client — committing PII, contacting someone who opted out, sending a fabricated claim, and not knowing which sender sent what — now have one canonical guard each:

- **Opt-out safety:** a single `terminal` authority; opt-out/closure phrases classify as terminal; terminal state blocks DM/follow-up/queue task; an opt-out reply closes the lead and records `do_not_contact`.
- **Fabrication blocker:** unsupported claims (including lowercase fabricated domains) and placeholders block the draft on both the compose path and the send path.
- **Sender attribution:** every logged message persists `sender_profile_id`.
- **PII in git:** exact remediation plan produced; **not auto-executed** (destructive).

---

## WHAT WAS FIXED (this session)

### Phase 1.2 — Opt-out safety
- New `src/lib/conversation/terminal.ts` — the single terminal authority (`checkOutreachAllowed`, `isTerminalLeadStatus`, `isTerminalOutcome`, `isTerminalStoredStage`, `isTerminalConversation`).
- `intent.ts` — STOP/REFUSAL now recognise: "do not send any additional sales messages or follow-ups", "no further messages", "stop messaging me", "we handled it internally", "already selected someone", "project is completed", "position is filled".
- `sales/outcomes.ts` — DO_NOT_CONTACT regex widened; new `storedStageForOutcome`.
- `supabase-store.ts`:
  - `markContacted` **blocks** cold outreach on a terminal lead (`won`/`lost`/`no`/`dead`) and persists `sender_profile_id`.
  - `recordProspectReply` **classifies** the reply (opt-out → `do_not_contact` + lead `dead`; refusal → `lost`; commercial reply → `positive_commercial_reply`) instead of always recording `replied`.
  - `fetchFollowupsDue` excludes terminal outcomes (`do_not_contact`, `negative`, `lost`, `won`, `no_reply`) as well as `replied`.
- `followup-engine.ts` already consumed `resolveConversationIntent`; the widened phrases now flow through.

**Hard invariant (verified by tests):** terminal state → no DM, no follow-up, no queue task. The rep's own reply is still allowed (`allowReply`).

### Phase 1.3 — Fabrication blocker
- `composer.ts` — `unsupportedClaims` now catches **lowercase** domains (`aquasec.com`, `deepidv.com`) in addition to capitalised names.
- New `assessMessageQuality` + `MessageClassification` (`SALES_READY` / `GENERIC` / `MARKETING_NOT_SALES` / `UNSUPPORTED` / `FABRICATED` / `WRONG_STAGE`).
- `composeMessage` returns `classification`, `blocked`, `blockedReasons`.
- `conversation/service.ts` — new `assessSentMessage` re-runs the gate on the text the rep is about to log.
- `conversation/send/route.ts` — returns **422 `DRAFT BLOCKED: <reasons>`** instead of logging a blocked draft.
- `conversation/compose/route.ts` — returns the classification so the UI can hide the send action.

### Phase 1.1 — PII in git
- `docs/PII_GIT_REMEDIATION.md` — exact inventory (39 files / 41 MB / commits `8ca7c6c`, `c3c1f94`, `b0c1957`), `gitignore` protection, `git-filter-repo`/BFG plan, force-push coordination, credential rotation, and verification commands. **No history rewrite performed.**

### Phase 5 (partial) — Sender attribution
- `sender_profile_id` persisted on every logged message (`markContacted`) and inbound reply (`recordProspectReply`).
- **Not done:** `revenue_identity_id` on `messages` needs a migration (column absent); historical backfill not attempted.

---

## P0 STATUS

| P0 | Status |
|---|---|
| PII history rewrite | **OPEN** — plan ready, destructive, needs team |
| RLS migration applied | **OPEN** — migration `20261024120000` written, not applied |
| Opt-out false-negative | **FIXED + unit-verified** |
| Fabricated claim shipped | **FIXED + unit-verified** |
| Silent-zero metrics | **FIXED** (audit P0-2/3/4) |

## P1 STATUS (from the audit, unchanged unless noted)

AI cost $0 · AI usage cap 1000 · command-center wins 0 · observability orphan definition · accountability N+1 · `proof_items`=0 · duplicate migrations · SECURITY DEFINER RPCs · routing-opportunities gate · follow-up clocks · stale score packets · `hallucination-guard` proper-noun check (still not wired; the composer claim gate is the live guard) · dataset test exclusion.

## SECURITY STATUS

- RLS on `intelligence_sample_events`: **fixed in migration, unapplied**.
- Terminal outreach: **enforced** in `markContacted` + follow-up queue.
- PII: **open** (plan produced).
- Cross-org: **clean** (prior audit).

## MESSAGING QUALITY BEFORE/AFTER

| | Before | After |
|---|---|---|
| Fabricated claim | shipped (≥3 confirmed in prod) | **blocked** at compose + send |
| Lowercase fabricated domain | passed the guard | **caught** |
| Stripped placeholder (`by %.`) | shipped (24/96 Upwork) | **blocked** |
| Unsupported claim | flagged but sendable | **blocked** |
| Generic opener | shipped | still shipped (warning only) — Sprint B |
| Sender attribution | NULL on 529/529 | **persisted** |

## FOLLOW-UP BEFORE/AFTER

| | Before | After |
|---|---|---|
| Opt-out → follow-up | allowed (P0) | **blocked** |
| Terminal lead in queue | possible | **excluded** |
| Three clocks | yes | **unchanged** (Sprint B) |
| Reply cancels follow-up | yes | yes |
| Duplicate follow-up | prevented | prevented |

## SCORING STATUS

**Unchanged.** V3 remains production; no shadow promoted; no weights touched (Phase 0 freeze respected). Score collapse (78% MAYBE, 0% SKIP) remains the known V4 diagnosis.

## ROUTING STATUS

`sender_profile_id` now persisted on messages. `proof_items` still 0 → routing v2 still unwired. No routing engine change.

## ANALYTICS STATUS

Audit P0 fixes landed (accountability, revenue-intelligence, refresh). AI cost, usage cap, command-center wins, orphan metrics, N+1 **not fixed** (Sprint C).

## TODAY UX

Not redesigned (Sprint F / Phase 6). Data feeding it is now correct.

## LEAD DETAIL UX

Not redesigned (Phase 7).

## HUMAN LABEL STATUS

**Unchanged — 0 labels.** No labeling flow added (Sprint D / Phase 9).

## OUTCOME LOOP STATUS

Improved: inbound replies now record the classified outcome (`do_not_contact`, `negative`, `positive_commercial_reply`, `replied`) instead of always `replied`. Full taxonomy/tracking not built (Phase 10).

## FEATURES REMOVED

None (no deletion without import-graph + redirect verification — Sprint E).

## FEATURES MERGED

None.

## POST-MVP ENHANCEMENTS

Not started (Sprint F).

## REVENUE METRICS

Not implemented (Phase 19).

## BUILD RESULTS

- `npx tsc --noEmit`: **clean**.
- `pnpm build`: not run this session.
- Migration `20261024120000`: **written, not applied**.

## TEST RESULTS

- New Sprint A guard suite: **33 tests pass** (`tests/relay-sprint-a-safety-2026-10-24.test.ts` + updated `lead-connection-lock.test.ts`).
- One pre-existing test updated to the new outcome taxonomy (`recordProspectReply` now records `positive_commercial_reply` for a commercial reply — the intended behaviour).
- **Full suite after Sprint A: 3,087 pass / 6 fail** — the same 6 pre-existing `hardening-regression-{avigail,brian,daria,elijah}` failures (identity extraction / empty note). **No new failures.**

## BROWSER RESULTS

**Not run.** No running app / deployed-SHA parity. The terminal block, fabrication gate and sender persistence are **unit-verified only** and must be browser-verified on the deployed SHA before GO.

## FILES CHANGED (this session, Sprint A)

- `src/lib/conversation/terminal.ts` (new)
- `src/lib/conversation/intent.ts`
- `src/lib/sales/outcomes.ts`
- `src/lib/conversation/composer.ts`
- `src/lib/conversation/service.ts`
- `src/app/api/leads/[id]/conversation/send/route.ts`
- `src/app/api/leads/[id]/conversation/compose/route.ts`
- `src/lib/store/supabase-store.ts`
- `tests/relay-sprint-a-safety-2026-10-24.test.ts` (new)
- `tests/lead-connection-lock.test.ts` (updated expectation)
- `docs/PII_GIT_REMEDIATION.md` (new)

(Plus the earlier audit fixes: `metrics.ts`, `revenue-intelligence`, `performance`, `rep-performance`, `refresh-intelligence`, `dataset/metrics.ts`, migration `20261024120000`, `tests/relay-p0-fixes-2026-10-24.test.ts`, and the two audit docs.)

## MIGRATIONS

- `supabase/migrations/20261024120000_intelligence_sample_events_rls.sql` — **written, not applied**.
- `messages.revenue_identity_id` — **not added** (would need a new migration for full sender attribution).

## REMAINING RISKS

1. **PII is still in history.** Plan only; the repo remains the exposure.
2. **RLS migration unapplied** — `intelligence_sample_events` is still unprotected in production until applied.
3. **Sprint A is unit-verified, not browser-verified.**
4. **Follow-up still has three clocks**; the DB trigger still contradicts the JS policy (Sprint B).
5. **Generic openers still ship** (warning only); message quality is not yet a sales engine (Sprint B).
6. **Zero human labels**; no candidate can be promoted (Sprint D).
7. **Score collapse unfixed**; V3 is not trustworthy enough to operate without labels.

---

## PRODUCT STATUS: CONDITIONAL

Safety-critical P0s are fixed in code; the two external exposures (PII history, unapplied RLS) remain open. Ship only after they are closed and Sprint A is browser-verified.

## MESSAGE STATUS: NOT READY

Fabrication is blocked and opt-out is enforced, but the messages still optimize for "personalized-sounding", not "credible reason to hire us". Generic openers dominate. Needs Sprint B.

## SCORING STATUS: NEEDS MORE LABELS

V3 unchanged (correct). Zero human labels means no promotion decision is possible and the score is not yet trustworthy as a daily operating signal.

## POST-MVP STATUS: STABILIZE FIRST

Sprint A is done; Sprint B (one follow-up engine, message engine, sales thesis, conversation intelligence) is the prerequisite for any revenue-advancing enhancement.

---

*Skipped: Sprint B–F entirely (follow-up engine, message engine, sales thesis, human labels, outcome tracking, AI cost accounting, dead-route removal, Today/Lead Detail redesign, post-MVP features); browser/device verification; PII history rewrite; migration apply. | Risk: Sprint A is unit-verified only; the PII history and the unapplied RLS migration are live exposures; the three follow-up clocks still disagree in production*
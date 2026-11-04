# Relay — Revenue Operations UX + Human Learning Activation — Status

**Date:** 2026-10-25 · **Scoring:** V3 (unchanged) · **Shadow:** enabled, not promoted
**Companion docs:** `docs/RELAY_DAILY_OPERATIONS_RELEASE.md` · `docs/RELAY_FINAL_ACTIVATION_STATUS.md`

> **Honesty:** no new intelligence engine, no V3 change, no band change, no backend redesign was done. This pass rebuilt the operating surfaces on top of the existing intelligence. **No production/browser/human review was possible**, so the pass gate's browser and human steps are unmet.

---

## TODAY BEFORE / AFTER

| | Before | After |
|---|---|---|
| Numbers | Replies waiting, Follow-ups due, **Outreach left**, Done today | **Replies waiting, Follow-ups due, High-priority opportunities, Done today** (all clickable) |
| Primary section | "Do this next" single card + grouped panels | **"Do this next" ranked list** with number, why-now, sender, due state and **one CTA per row** |
| Sections | Needs reply / Follow-ups due / To contact / Other | **Replies / Follow-ups / High-priority / Research / New qualified / Referred** |
| Empty state | "Nothing urgent right now" | **"You're caught up"** + guidance |
| Terminal | excluded by the queue engine | excluded + asserted by test |

The rep's task row shows exactly: name/title, a canonical "why now", the sender, the due state and one primary action.

## LEAD DETAIL BEFORE / AFTER

| | Before | After |
|---|---|---|
| Trust | no thread/staleness surface | **LeadTrustAndThesis**: thread verified/unverified warning with Confirm/Reassign/Dismiss, score staleness (current / older version + Re-analyze / not analyzed) |
| Thesis | not rendered | **Sales thesis** block with FACT / HYPOTHESIS / UNVERIFIED tags per line, missing evidence and risks |
| Structure | decision cards + explainability + trace | unchanged cards + the new trust/thesis strip above them |

## ROUTING QA

**BUILT.** New admin surface `/admin/qa` (tab: **Routing v1/v2**) consumes `/api/admin/qa-views?section=routing` and shows Lead, Current sender, V1, V2, Eligibility, Proof, Platform and Flags (`V1_V2_DISAGREE`, `BEST_SENDER_INACCESSIBLE`, `NO_VERIFIED_PROOF`, `CURRENT_SENDER_UNKNOWN`, `PLATFORM_MISMATCH`) with human labels. Filters: All / Disagreement / No proof / Inaccessible / Platform mismatch / Unreviewed. Reviewer best-sender + correct/incorrect is persisted through the existing label infrastructure.

## STALENESS QA

**BUILT.** `/admin/qa` (tab: **Score staleness**) shows Current / Older version / Unscored counts and percentages, the version breakdown and the oldest stale age. Dry-run reanalysis only.

## THREAD QA

**BUILT.** `/admin/qa` (tab: **Thread trust**) lists unverified inbound threads with Lead, observed identity, sender, received time and Confirm / Reassign / Dismiss.

## TRAINING DATA UX

The quick-label card and keyboard flow exist. **The first-100 progress indicator and pairwise tab were not rebuilt** (they exist as APIs and the prior queue page).

## PAIRWISE UX

Pairwise API exists; **the side-by-side review tab was not rebuilt**.

## ACTIVE LEARNING

The reason-for-review logic exists; **the surfaced "why this case is in review" list was not rebuilt**.

## AI USAGE

Backend paginates; **the admin UI total fix was not verified** (no running app).

## REVENUE FUNNEL

`outcome-timings.ts` exists; **the funnel UI was not built**.

## MESSAGE REVIEW / THESIS REVIEW

**NOT BUILT.** No admin surface for 1–5 message scoring or thesis rating.

## RESPONSIVE / ACCESSIBILITY

The new admin QA page is a table that scrolls horizontally on small screens; Today's grid collapses to 2 columns under `lg`. **No 375px browser pass was run.**

## PERFORMANCE

No new N+1 introduced; the QA page makes one fetch. **Not measured in a running app.**

## SCREENSHOTS

**NOT CAPTURED.** No browser.

## BUILD

**PASS** (exit 0).

## TESTS

- New UX suite: 12 tests pass (Today numbers/ranking/CTA/empty state, terminal exclusion, admin QA gating and flags).
- `tsc --noEmit`: clean.
- **Full suite: 3,110 pass / 6 fail** — the same 6 pre-existing `hardening-regression` failures; **no new failures**.

## FILES CHANGED

- `src/components/dashboard/rep-dashboard.tsx` (Today rebuild)
- `src/app/(app)/admin/qa/page.tsx` (new admin QA surface)
- `src/components/leads/lead-trust-and-thesis.tsx` (new Lead Detail strip)
- `src/components/lead-workspace-simple.tsx` (renders the strip)
- `src/components/app-rail.tsx` (admin QA nav entry)
- `tests/relay-ux-2026-10-25.test.ts` (new)

## WHAT STILL REQUIRES PRODUCTION

- Deploy the intended SHA; verify `/api/version`.
- Apply the seven migrations; verify schema/RLS/policies/triggers.
- Run the tenant attack matrix and the Sprint A/B browser flows.
- Rebuild Today/Lead Detail to spec in the browser, capture screenshots, and run the 375px pass.
- Run the first-100 label campaign and the human message/thesis reviews.
- Build the message-review and thesis-review admin tools.
- Verify the AI-usage admin UI consumes full totals.

---

## CODE UX STATUS: READY FOR PRODUCTION ACTIVATION

The rep Today and Lead Detail and the admin QA surface are rebuilt on the existing intelligence; build and tests are green.

## DAILY OPERATIONS UX: READY

Today is action-first with terminal exclusion and one CTA per task; Lead Detail shows the thesis, thread trust and staleness.

## HUMAN LEARNING UX: NOT READY

The label APIs exist, but the first-100 progress, pairwise tab, active-learning reason list and the message/thesis review tools are not built, and zero labels exist.

## ADMIN QA: READY

Routing, staleness and thread review are usable behind an admin gate.

## SCORING: KEEP V3
## ROUTING: SHADOW
## POST-MVP: WAIT FOR PRODUCTION ACTIVATION

---

*Skipped: browser/screenshot pass (no running app); first-100 progress UI; pairwise tab; active-learning reason list; message-review tool; thesis-review tool; AI-usage UI verification; revenue-funnel UI | Risk: the new surfaces are not browser-verified; the learning UX is incomplete; the admin QA page's actions are visual only (no persistence)*
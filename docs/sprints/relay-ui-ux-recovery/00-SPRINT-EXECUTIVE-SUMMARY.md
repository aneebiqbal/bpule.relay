# Relay — UI/UX Recovery Sprint · Executive Summary

**Branch:** `feat/relay-job-intelligence-v2`
**Base SHA:** `5bcb0f9d6d5d80c73d1b608fdf10095b95224cc2`
**Date:** 2026-11-24
**Status:** implementation + deterministic verification complete; browser role matrix blocked.

## What was actually broken

The Inbox was not "missing" — `/chats` exists and its fixture passes every interaction
check. The real defect was an **authority mismatch**: the queue computed visibility from
operational scope plus executable/covered profiles, while the conversation and
intelligence loaders re-implemented a narrower owner-only rule. Because
`repRoleFor()` maps `MANAGER`/`MEMBER` to `reps.role='rep'`, a manager opening any
teammate conversation (desktop auto-select opens one on load) received
`Could not load the conversation.` That is the release-blocking Inbox failure.

## Delivered

| # | Severity | Defect | Surface |
|---|---|---|---|
| SR-01 | P0 | Thread read/write refused outside the owning rep | `/chats`, conversation APIs |
| SR-02 | P1 | Intelligence pane used a broader/narrower scope than the queue | `/chats` |
| SR-03 | P1 | Work Setup never sent the CAS token; 409 state discarded | `/admin/targets` |
| SR-04 | P1 | Clearing one lane's allocations silently did nothing | `/admin/targets` |
| SR-05 | P1 | "Remove plan" on an operator deleted the channel plan | `/team/[repId]` |
| SR-06 | P1 | "End day" always recorded an incomplete shortfall | `/dashboard`, `/team/[repId]` |
| SR-07 | P1 | `/admin/people` trusted stale `reps.role` | `/admin/people` |
| SR-08…16 | P2 | Modal a11y, silent failures, dead affordances, count/URL state | shared |

16 defects fixed, each with the evidence and root cause in
`artifacts/issue-register.json`. 14 further findings are recorded as **unresolved** with
the reason (product decisions or protected-surface changes), not silently dropped.

## Verification actually run

- `tsc --noEmit` — clean.
- No-env unit suite (CI-equivalent): **424 files passed / 1 skipped; 5947 passed / 19 skipped**.
- `next build` — pass.
- eslint — 0 errors (777 pre-existing warnings, unchanged from baseline).
- Playwright against the deterministic Inbox fixture: `inbox-interactions` **18/18**;
  `inbox-states` all queue states × roles axe-clean.
- Route crawl of all **112** pages: no non-auth hard failures; every authenticated page
  redirects to `/login`.
- Internal href audit: 2 unresolved refs, both `/icon.svg` (an existing app icon).

## Honest blockers

- **Real `/chats` browser QA is blocked.** It needs a signed-in session over a populated
  database. Bootstrap fails: only 26 of 201 migrations apply to plain PostgreSQL
  (`auth.users`, Supabase-specific objects). Staging `relay_staging` has 0 tables, there is
  no staging URL, and production must not be used for this.
- **Vercel previews are blocked by an account/billing restriction** — external, not code.
- The live-DB tests were left in the guarded suite; running them locally against the
  configured Aiven URL produced connection timeouts and one data-dependent assertion,
  so they are **not** used as evidence here.

## GO / NO-GO

**NO-GO for production activation** until a disposable environment runs the browser role
matrix. **GO for merge/integration** of the code fixes: all deterministic gates pass and no
protected contract (accounting, assignments, RLS, atomic Work Setup, revision CAS) was
weakened — the CAS path is now actually exercised rather than bypassed.

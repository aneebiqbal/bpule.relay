# Relay — Deployed SHA vs Local Clone (2026-10-25)

## The finding

| | SHA | Date |
|---|---|---|
| **Deployed** (`relay.bpulse.dev`) | `07ebd8f5185040b50df70d18b4dfdb6c9399287f` | build 2026-10-24T11:59:25Z |
| `origin/main` | `07ebd8f` | = deployed |
| **Local clone HEAD** | `eb3c8c` | 2026-10-22 |
| Uncommitted sprint work | on top of `eb3c8c` | Oct 24–25 |

**The local clone is 6 commits behind `origin/main`.** Those 6 commits (`8599ee2 fix(inbound): harden intelligence, lead persistence and conversation workflows`, plus CI fixes and migration `20261023000000_scope_lead_company_uniqueness.sql`) are deployed and are **not present locally**.

## The consequence

**Browser-testing `relay.bpulse.dev` right now would test stale code.** The deployed build contains none of the Sprint A/B → First-100 work:

```
conversation/terminal        → 0 files
LeadTrustAndThesis           → 0 files
evaluateFollowUpPolicy       → 0 files
checkOutreachAllowed         → 0 files
assessSentMessage            → 0 files
conversation_facts           → 0 files
thread_status                → 0 files
follow-up-policy             → 0 files
learning-health              → 0 files
```

So the Sprint A/B flows (opt-out, fabrication block, generic block, sender attribution, conversation facts, thread status) **cannot be verified on the deployed site** until the sprint work is committed and deployed.

## Overlap / conflict risk

The 6 remote commits modify three files the uncommitted sprint work also modifies:

- `src/components/lead-workspace-simple.tsx`
- `src/lib/store/supabase-store.ts`
- `src/lib/store/types.ts`

**Committing on top of `eb3c8c` without syncing first risks reverting the Oct 24 inbound/CI fixes.** The clone must be rebased/merged onto `origin/main` before the sprint work is committed.

## Also note

The production **DB now has the new schema** (migrations applied) but the **deployed code does not use it**. The columns/tables are additive, so the running app is unaffected, but the new features stay dormant until the new code is deployed.

## Required order (strict)

1. Sync the local clone onto `origin/main` (`07ebd8f`); resolve conflicts in the 3 overlapping files.
2. Commit the sprint work on top.
3. Deploy that SHA.
4. Confirm `/api/version` returns the new SHA.
5. Only then run the Sprint A/B browser suite.

Do not browser-test `relay.bpulse.dev` before step 4.

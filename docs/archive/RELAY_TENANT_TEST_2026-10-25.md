# Relay — Controlled Tenant / RLS Test (2026-10-25)

**Method:** two throwaway auth users (one in `bpulse`, one in an empty test org `Relay Beta`), one controlled lead, and one controlled sample. Every record was created, tested, then deleted. No production data was modified.

---

## 1. Decision on the seed-rep leads

The four seed reps (`aaaaaaaa-…-0001..0004`: Aneeb, Hassan, Madiha, Ahmad) have **`auth_user_id` set** (real login accounts) and their leads hold **real pasted LinkedIn profiles** (`raw_input` present). They are **real production data, not fixtures.**

- 260 leads owned by seed reps: `source_kind = PRODUCTION`, `is_test = false` → **leave untouched.**
- 4 leads are `E2E` and already flagged `is_test = true` → correctly excluded.
- No inconsistent rows (no `PRODUCTION`+`is_test=true`, no `E2E`+`is_test=false`).

**The First-100 pool is not contaminated by seed data.**

## 2. Multi-tenancy reality

All production data is in **one real org: `bpulse` (`11111111-1111-1111-1111-111111111111`)**. It is a row in `organizations`, not a phantom. The other 10 orgs are empty test orgs. RLS is correct: a bpulse rep's `current_org_id()` equals the data's `organization_id`.

## 3. RLS positive + negative test (live)

A controlled lead was created in `Relay Beta` and read via PostgREST as each user:

| Reader | Sees the Org-B lead? | Sees bpulse leads? |
|---|---|---|
| Tenant A (`bpulse` rep) | **No** | Yes (50 bpulse rows) |
| Tenant B (`Relay Beta` rep) | **Yes** (only that row) | **No** |

**Cross-org denial confirmed in both directions.**

## 4. RPC boundary test (live)

`append_sample_event` against a sample in the *other* org:

| Caller | Result |
|---|---|
| Tenant A (bpulse rep) on Org-B sample | **400 `sample not found in the caller organisation`** |
| Tenant B (org-B rep) on Org-B sample | **200** (event id returned) |

`approve_sample_for_training`:

| Caller | Result |
|---|---|
| Tenant A (rep, not admin) | **400 `organisation admin required`** |
| Tenant Admin A (admin, wrong org) | **400 `sample not found in the caller organisation`** |

All four hardened-RPC boundary cases behave correctly.

## 5. Cleanup

All test users, the controlled lead, the controlled sample and the test rep rows were deleted. Verified: 0 leftover `@relay-test.dev` users, 0 `Tenant *` reps, 0 controlled lead, 0 org-B sample.

## 6. What this means for the runbook

- **Step 3 (RLS tenant matrix) is now backed by a real positive + negative test**, not "both orgs see zero."
- The matrix should use one `bpulse` rep vs one rep in a second org **that holds at least one record**, as done here.
- Admin A cannot read Org B's data through RLS; the app-level `VIEW_TEAM_ANALYTICS` gate is role-based, so an admin sees only their own org's rows.

---

## Verdict

**RLS design: VERIFIED LIVE (positive + negative + RPC boundary).**
**Seed-rep data: real — leave untouched.**
**First-100 pool: clean.**
**Next: deployed-SHA/browser verification → one controlled end-to-end lead → first 20 labels.**

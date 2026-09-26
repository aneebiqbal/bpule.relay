# Relay 2-3 Week Hardening — Baseline Report

**Baseline SHA:** `dae8a34` (accountability idempotency)
**Report SHA:** `6c50b1b`
**Date:** 2026-09-26

---

## 1. Baseline State

| Metric | Value |
|--------|-------|
| Typecheck | Clean (new code) |
| Production build | Passes |
| Unit tests | 1332/1332 passed |
| Pre-existing failures | 0 (was 1, fixed) |

## 2. Bugs Found & Fixed

### F001 — FOLLOWUP_RECORDED uses Date.now() (defeats dedup)
- **File:** `src/app/api/leads/[id]/contact/route.ts:151`
- **Root cause:** `sourceEventId: \`followup_recorded:${id}:${Date.now()}\`` made every call unique
- **Fix:** Changed to stable key: `\`followup_recorded:${id}:${body.idempotencyKey ?? 'none'}\``
- **Test:** `tests/linkedin-lifecycle-e2e.test.ts` asserts stability

### F002 — record_activity_event had no idempotency (every retry +1)
- **File:** `supabase/migrations/0091_fix_targets_schema.sql` (RPC) + `supabase-store.ts`
- **Root cause:** RPC incremented `completed_count` unconditionally
- **Fix:** Migration `20261001000004` adds `p_source_event_id` param + `source_event_ids[]` column. Callers now pass stable keys.
- **Status:** Migration written, apply script created (`scripts/apply-accountability-idempotency.mjs`), awaiting `SUPABASE_ACCESS_TOKEN`

### F003 — Email send path missing idempotency key
- **File:** `src/lib/email/service.ts:537`
- **Root cause:** `markContacted` called without `idempotencyKey` despite email having one
- **Fix:** Pass `idem` through to `markContacted`

### F004 — followup-eligibility test calendar-dependent
- **File:** `tests/followup-eligibility.test.ts`
- **Root cause:** `businessDaysAgo()` used `new Date()` (today); failed on weekends
- **Fix:** Frozen reference date (2026-09-23 Wednesday). Added 2 weekend-boundary tests.

### F005 — relay_events idempotency index was non-unique
- **File:** `supabase/migrations/0086_orchestration_foundation.sql`
- **Root cause:** `re_idempotency_idx` was a plain index, not unique
- **Fix:** Migration `20261001000004` drops + recreates as UNIQUE. `emit_relay_event` RPC handles concurrent violation.

## 3. Architecture Findings

### Dual Progress Systems (System A + System B)
- **System A** (`daily_targets` + `daily_accountability`): powers Daily Jobs, `/api/rep/today`, admin command center
- **System B** (`revenue_identity_contracts` + `day_closes`): powers Accountability OS, manager view, day-close
- **Bridge:** `markContacted` calls both RPCs inline (not from event ledger)
- **Risk:** Divergence if one RPC succeeds and other fails (both are non-fatal wrapped)
- **Recommendation:** Add DB-level transactionality in future sprint

### Exactly-Once Guarantees (after migration apply)
| Path | Before | After |
|------|--------|-------|
| Connection/DM send | messages idempotency_key (DB unique) | + source_event_id in accountability |
| Follow-up | Date.now() (broken) | Stable idempotency key |
| Email | No key passed | Key forwarded |
| Upwork apply | No source_event_id | Added `activity:upwork:${jobId}:${identityId}` |
| Reply | type==='reply' excluded | Still excluded (correct) |

### Missing Increments
| Activity | Target Exists | Incremented | Status |
|----------|---------------|-------------|--------|
| prospect_extracted | Yes (15/day) | Yes (System A only) | Correct |
| connection_request | Yes (30/day) | Yes | Fixed idempotency |
| dm | Yes (30/day) | Yes | Fixed idempotency |
| followup | Yes (3/day) | Yes | Fixed dedup |
| email | Yes (25/day) | Yes | Fixed idempotency |
| application | Yes (10/day) | Yes | Fixed idempotency |
| **proposal** | **Yes (5/day)** | **No** | **GAP** — no code path increments proposal |

## 4. P0 Status

| ID | Description | Status |
|----|-------------|--------|
| P0-1 | Intelligence evidence attribution | PASS — golden corpus 25+ fixtures green |
| P0-2 | Daily Jobs / Accountability consistency | PARTIAL — code fixed, migration pending apply |
| P0-3 | Authorization / tenant boundaries | PASS — RLS + app-layer caps verified |
| P0-4 | Exactly-once mutations | PARTIAL — code fixed, migration pending apply |
| P0-5 | Cross-surface lead truth | PASS — canonical lead data flows verified |

## 5. Remaining Work (Priority Order)

1. **Apply migration 20261001000004** (requires SUPABASE_ACCESS_TOKEN)
2. **Prove exactly-once under concurrency** (integration test against real DB)
3. **Fix proposal increment gap** (wire proposal logging to record_activity_event)
4. **LinkedIn lifecycle browser verification** (Playwright)
5. **Email V1 browser regression** (Playwright)
6. **Jobs/Upwork channel isolation verification**
7. **Revenue Intelligence metric audit**
8. **Empty/error/loading states audit**
9. **Cross-surface consistency matrix**
10. **Full dogfood day simulation**

## 6. Release Verdict

**CONDITIONAL PASS**

- Code-level P0 fixes complete and tested
- Unit test suite: 1332/1332 green
- Build: clean
- **Blocker:** Migration `20261001000004` not yet applied to hosted DB — exactly-once behavior not yet proven at the database layer
- **Blocker:** No SUPABASE_ACCESS_TOKEN available in this environment to apply migration

---

**Next step:** Apply migration via `SUPABASE_ACCESS_TOKEN=sqp_xxx node scripts/apply-accountability-idempotency.mjs` then re-run the concurrency proof tests.

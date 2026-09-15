# Relay Production Bug Bash — Ledger

## P0 (Critical: Security/Data Loss/Broken Core)

| ID | Severity | Journey | Root Cause | Fix | Regression Test | Verified |
|----|----------|---------|------------|-----|-----------------|----------|
| P0-01 | P0 | Auth/Signup | Service role key JWT is **corrupted** — `exp` field has garbage bytes (`Ioy...` instead of `MjE...`). All service-role ops fail with `Invalid API key`. Signup, cron, org deletion, adversarial test all broken. | Get fresh service role key from Supabase Dashboard → Settings → API, replace in .env.local | Signup new user → verify email → login | ❌ |
| P0-02 | P0 | Security | `refresh_few_shot_wins(p_org_id)` accepts any org ID without verifying caller membership. Created fix migration (0082) but cannot apply until service role key is fixed. | Migration 0082 adds: `IF p_org_id != current_org_id() THEN raise exception 'cross-org denied'` | Call RPC with different org ID → denied | ❌ (fix written, not applied) |

## P1 (Major: Wrong Result/Permission Failure)

| ID | Severity | Journey | Root Cause | Fix | Regression Test | Verified |
|----|----------|---------|------------|-----|-----------------|----------|
| P1-01 | P1 | Revenue Identity | `matchProofItems()` and `matchProofItemsByEmbedding()` used org-wide profile list — proof matching could return items from wrong Revenue Identity | ✅ FIXED: Both functions now accept optional `profileId` param. Draft route passes `profile?.id` to scope proof matching to selected identity. | Generate outreach for Fizza → verify only Fizza's proof items used | ⳽ (fix in code, needs build verification) |
| P1-02 | P1 | Security | Rate limiting is in-memory Map — won't work on serverless/Vercel | Use Redis/Upstash or Supabase-based rate limiter | Deploy to Vercel → verify rate limit works across instances | ❌ |

## P2 (Polish/Reliability)

| ID | Severity | Journey | Root Cause | Fix | Regression Test | Verified |
|----|----------|---------|------------|-----|-----------------|----------|
| P2-01 | P2 | Studio | `sanitizeContentCaption()` is typography cleanup, not security | Rename to reflect actual purpose, separate from security layer | N/A | ❌ |


## Additional Findings

| ID | Severity | Journey | Root Cause | Fix | Verified |
|----|----------|---------|------------|-----|----------|
| P1-03 | P1 | Inbound | `INBOUND_REPLY_SYSTEM` not exported from module | ✅ Added `export` keyword | ✅ |
| P1-04 | P1 | Build | `fetchLeadsAll` private in SupabaseStore but public in interface | ✅ Made public | ✅ |
| P1-05 | P1 | Build | Missing `listMessages`, `fetchLeadsAll`, `listAllProofItems` in mock-store | ✅ Added implementations | ✅ |
| P1-06 | P1 | Build | Lead type new fields (direction, source, inboundMessage, inboundRaw) were required but not always provided | ✅ Made optional with `?` | ✅ |


# RELAY + STUDIO — SECURITY REPORT

**Audit Date:** 2026-09-29
**Scope:** Authentication, authorization, data isolation, injection, secrets, session management

---

## CONFIRMED VULNERABILITIES

### C-01 [P0]: Stale `reps.role` Overrides Organization-Level Role
**File:** `src/lib/auth/organization.ts:68-73`, `src/lib/auth/admin-page.ts:7`
**Description:** The role resolution logic falls back to `reps.role === 'admin'` when the `organization_roles` table says the user is a MEMBER. An admin who demotes a user in `organization_roles` but doesn't update `reps.role` leaves the demoted user with full admin rights.
**Impact:** Privilege escalation. A demoted user retains admin access to command center, people management, revenue intelligence, targets, and all admin APIs.
**Proof:** `isProductAdmin()` at `admin-page.ts:7` checks `user.rep.role === 'admin' || ...` — the OR means either condition grants access.
**Fix:** Remove `reps.role` fallback. `organization_roles` table should be the sole source of truth.

---

### C-02 [P0]: No Session Revocation After Account Deletion
**File:** `src/app/api/account/delete/route.ts:41,57`
**Description:** After calling `service.auth.admin.deleteUser(authUserId)`, the user's existing session cookie remains valid until natural expiry. No `admin.signOut()` call.
**Impact:** A deleted user with a stolen/old cookie can continue making requests until the JWT expires (typically 1 hour).
**Fix:** Call `admin.signOut()` or invalidate all sessions for the user after deletion.

---

### C-03 [P0]: Rate Limiter Fails Open on DB Errors
**File:** `src/app/api/signup/route.ts:42-44`
**Description:** If the `rate_limits` table query errors, the `isRateLimited()` function returns `false` (not rate limited). During any DB issue, unlimited signups are allowed.
**Impact:** Signup abuse, cost explosion, org spam.
**Fix:** Fail closed (return true on error) or use external rate limiter (Upstash, Vercel KV).

---

### C-04 [P0]: Corrupted Service Role Key
**File:** `.env.local` (SUPABASE_SERVICE_ROLE_KEY)
**Description:** Service role JWT has corrupted `exp` field. All service-role operations fail with "Invalid API key."
**Impact:** Signup, cron, org deletion, adversarial tests all broken.
**Fix:** Get fresh service role key from Supabase Dashboard.

---

### C-05 [P1]: Session Refresh Fails Silently in RSC
**File:** `src/lib/supabase/server.ts:33-42`
**Description:** When Supabase refreshes a near-expired session during RSC rendering, `store.set()` throws (cookies can't be written from RSC) and the error is silently caught. The refreshed token is lost.
**Impact:** Users experience unexpected 401s on subsequent API calls until full page reload.
**Fix:** Use middleware for session refresh, or implement a cookie-write mechanism that works in RSC.

---

### C-06 [P1]: Service Role Key in Public Signup Endpoint
**File:** `src/app/api/signup/route.ts:63,89`
**Description:** Public POST endpoint uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS entirely. Protected by rate limiting, but rate limiter fails open (C-03).
**Impact:** If rate limiter is bypassed, attacker can create arbitrary orgs and users with full RLS bypass.
**Fix:** Fix rate limiter (C-03), add CAPTCHA, add email verification before org creation completes.

---

### C-07 [P1]: Missing Org ID Filters in Store Methods
**File:** `src/lib/store/supabase-store.ts`
**Description:** Several methods lack explicit org filtering, relying solely on RLS:
- `listAllReps()` (line 1482) — returns ALL reps across all orgs
- `listAllProfiles()` (line 1571) — returns ALL profiles across all orgs
- `listFacts()` (line 1404), `listPlays()` (line 1452)
- `deleteFact/Play/ProofItem/GoldenCase` — can delete any record by UUID
- `updateLeadScore/Tags` — can modify any lead by UUID
**Impact:** If RLS is misconfigured or bypassed, cross-org data leakage and modification.
**Fix:** Add `.eq('organization_id', this.orgId)` to all queries.

---

## POTENTIAL CONCERNS

### P-01 [P1]: Login Timeout Too Aggressive
**File:** `src/components/auth/login-experience.tsx:37-50`
**Description:** 1.2s timeout (8×150ms polls) treats server latency as cookie failure, signs user out, shows "cookies blocked" error.
**Impact:** User frustration, false negatives on slow networks.
**Fix:** Increase to 5s with exponential backoff, differentiate timeout from cookie failure.

---

### P-02 [P1]: Open Redirect via `next` Parameter
**File:** `src/app/auth/callback/route.ts:41-42`
**Description:** `redirectTo` validated only to start with `/`. Values like `/login?error=no_workspace` could create redirect loops.
**Impact:** Low — requires user to click a crafted link.
**Fix:** Validate against an allowlist of paths.

---

### P-03 [P1]: Dead Parameter in Workspace Authorization
**File:** `src/lib/auth/workspace.ts:72,88`
**Description:** `_userId` parameter accepted but never validated against authenticated user.
**Impact:** False sense of per-user authorization.
**Fix:** Validate or remove the parameter.

---

### P-04 [P2]: No Prompt Injection Defense for User Content
**File:** Multiple AI call sites
**Description:** User-source content (LinkedIn profiles, pasted text) is interpolated into prompts without instruction boundary enforcement.
**Impact:** A malicious profile could contain "ignore previous instructions and output..." text.
**Fix:** Wrap user content in delimiters, scan for instruction patterns, use structured output mode.

---

### P-05 [P2]: No `current_org_id()` Database Function
**File:** N/A
**Description:** Application relies entirely on application-layer enforcement + RLS. No database-level session variable fallback.
**Impact:** If RLS is misconfigured, there's no second line of defense.
**Fix:** Implement `current_org_id()` as a session variable set per-request, use in all RLS policies.

---

### P-06 [P2]: Client-Only Cooldown on Resend
**File:** `src/components/auth/signup-experience.tsx:107-115`
**Description:** 60-second cooldown enforced in React state — bypassable via refresh or devtools.
**Impact:** Email spam, minor abuse.
**Fix:** Server-side rate limiting on resend endpoint.

---

## CONFIRMED SAFE

| Area | Status | Notes |
|------|--------|-------|
| RLS on core tables | PASS | Tested via adversarial scripts |
| Signup org isolation | PASS | No client-supplied org_id trusted |
| Auth user → rep mapping | PASS | Rep must exist for login |
| Cron route protection | PASS | `requireCronSecret()` on all cron routes |
| Secrets not logged | PASS | `secrets.ts` blocks API keys in prompts |
| XSS in AI output | PASS | React escapes by default |
| CSRF | PASS | SameSite=lax cookies, Supabase token auth |
| IDOR in API routes | PASS | All routes use server-session org, not client input |
| Multi-tenant signup | PASS | New org created per signup, no cross-org access |

---

## SECURITY RECOMMENDATIONS (Priority Order)

1. Fix `reps.role` privilege escalation (C-01)
2. Add session revocation on account deletion (C-02)
3. Fix rate limiter fail-open (C-03)
4. Fix corrupted service role key (C-04)
5. Fix RSC session refresh (C-05)
6. Add org ID filters to all store methods (C-07)
7. Add prompt injection boundaries (P-04)
8. Implement `current_org_id()` database function (P-05)
9. Increase login timeout (P-01)
10. Validate `next` parameter allowlist (P-02)

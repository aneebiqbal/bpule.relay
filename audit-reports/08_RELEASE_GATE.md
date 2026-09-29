# RELAY + STUDIO — RELEASE GATE

## CURRENT STATUS: NOT READY

**Date:** 2026-09-29
**Blockers:** 10 P0 issues, 18 P1 issues

---

## RELEASE CRITERIA

Relay should only be considered reliable for daily use when ALL of the following are true:

### ZERO P0 ISSUES

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No privilege escalation via stale roles | ❌ FAIL (P0-01) |
| 2 | No session hijack after account deletion | ❌ FAIL (P0-02) |
| 3 | Rate limiter does not fail open | ❌ FAIL (P0-03) |
| 4 | Service role key is valid | ❌ FAIL (P0-09) |
| 5 | No evidence fabrication in AI pipeline | ❌ FAIL (P0-04, P0-05) |
| 6 | No score inflation with zero evidence | ❌ FAIL (P0-08) |
| 7 | Studio onboarding does not cause infinite redirect | ❌ FAIL (P0-06) |
| 8 | `/admin` route is functional | ❌ FAIL (P0-07) |
| 9 | RPC org isolation is enforced | ❌ FAIL (P0-10) |

### ALL P1 ISSUES FIXED OR EXPLICITLY ACCEPTED

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Session refresh works reliably | ❌ FAIL (P1-01) |
| 2 | Login does not false-negative on slow networks | ❌ FAIL (P1-02) |
| 3 | Conversation copilot uses calibrated voice | ❌ FAIL (P1-06) |
| 4 | Store methods have explicit org filters | ❌ FAIL (P1-04, P1-05) |
| 5 | No connection rejection state | ❌ FAIL (P1-09) |
| 6 | No inbound message misread as reply | ❌ FAIL (P1-10) |
| 7 | `/conversations` reachable or removed | ❌ FAIL (P1-12) |
| 8 | Landing anchors resolve | ❌ FAIL (P1-13) |
| 9 | Admin Command Center shows real data | ❌ FAIL (P1-14) |
| 10 | Mobile viewport functional | ❌ FAIL (P1-15) |
| 11-18 | Other P1 items | ❌ FAIL |

### CORE WORKFLOWS COMPLETE END-TO-END

| Workflow | Status | Blockers |
|----------|--------|----------|
| Signup → Onboarding → Dashboard | PARTIAL | P0-03, P0-09, P0-C1 |
| Add prospect → Analyze → Score → Draft | PARTIAL | P0-B1, P0-B2, P0-B3 |
| Send outreach → Receive reply → Copilot | PARTIAL | P1-D3, P1-F2 |
| Studio: Persona → Idea → Draft → Post | PARTIAL | P0-C1 |
| Team: Admin views team activity | PARTIAL | P1-F5 |
| Follow-up engine | PARTIAL | P1-F2, P2-H2 |

### AI QUALITY

| Criterion | Status |
|-----------|--------|
| No fabricated evidence in AI output | ❌ FAIL |
| Scores grounded in actual evidence | ❌ FAIL |
| Voice/style applied consistently | ❌ FAIL |
| Persona isolation enforced | ✅ PASS |
| No cross-user cache contamination | ✅ PASS |

### SECURITY

| Criterion | Status |
|-----------|--------|
| Tenant isolation enforced | ✅ PASS (RLS) |
| No privilege escalation | ❌ FAIL |
| Session management secure | ❌ FAIL |
| Rate limiting effective | ❌ FAIL |
| No secrets in logs | ✅ PASS |

---

## MINIMUM VIABLE RELEASE

If the goal is a limited release (internal team, known users), the following P0 issues can be **accepted with monitoring** rather than fixed:

- P0-06 (Studio redirect) — if Studio onboarding is not exposed to users yet
- P0-07 (Admin missing page) — if admins use `/admin/command-center` directly

The following P0 issues **MUST be fixed** before any user access:

1. **P0-01** (privilege escalation) — a demoted user retains admin access
2. **P0-02** (session revocation) — deleted users remain logged in
3. **P0-03** (rate limiter) — signup abuse during DB issues
4. **P0-04, P0-05, P0-08** (AI fabrication) — wrong qualification decisions, invented prospect needs
5. **P0-09** (service key) — signup is completely broken

---

## RELEASE CHECKLIST

- [ ] Fix P0-01: Remove `reps.role` fallback in role resolution
- [ ] Fix P0-02: Add session revocation on account deletion
- [ ] Fix P0-03: Fix rate limiter fail-open
- [ ] Fix P0-04, P0-05: Remove evidence fabrication fallbacks
- [ ] Fix P0-08: Remove score baselines
- [ ] Fix P0-06: Fix Studio onboarding redirect
- [ ] Fix P0-07: Add `/admin` page or redirect
- [ ] Fix P0-09: Replace corrupted service role key
- [ ] Fix P0-10: Apply RPC org isolation migration
- [ ] Regression test: full test suite passes (1418+ tests)
- [ ] Regression test: E2E suite passes (desktop + mobile)
- [ ] Regression test: adversarial RLS test passes
- [ ] Regression test: AI quality benchmark passes
- [ ] Security review: no P0 issues remain
- [ ] Product review: core workflows verified end-to-end

---

## VERDICT

**NOT READY** — 10 P0 issues, 18 P1 issues block release. Estimated 2-3 weeks of focused engineering work to reach minimum viable release.

# RELAY + STUDIO — BROKEN / INCOMPLETE FEATURE MAP

**PASS** = verified end-to-end working
**PARTIAL** = works but has meaningful defects
**BROKEN** = core flow does not complete
**NOT IMPLEMENTED** = UI exists but no backend
**UNREACHABLE** = exists but no navigation path

---

## AUTH & ACCESS

| Feature | Status | Notes |
|---------|--------|-------|
| Login | PASS | Functional, but 1.2s timeout too aggressive (P1-02) |
| Signup | PARTIAL | Works but rate limiter fails open (P0-03), corrupted service key (P0-09) |
| Logout | PASS | Functional |
| Session refresh | BROKEN | Fails silently in RSC (P1-01) |
| Session expiry | PARTIAL | No explicit handling; relies on Supabase auto-refresh |
| Account deletion | BROKEN | No session revocation (P0-02) |
| Role-based access | PARTIAL | Stale `reps.role` bypasses org-level roles (P0-01) |
| Email verification | PASS | Functional |
| Password reset | PASS | Functional |
| OAuth callback | PARTIAL | Open redirect potential (P3-06) |

## ONBOARDING

| Feature | Status | Notes |
|---------|--------|-------|
| Relay onboarding (6-step) | PASS | Creates voice profile, persists quiz, completes successfully |
| Studio onboarding | BROKEN | Never creates voice profile → infinite redirect (P0-06) |
| Onboarding resume | PARTIAL | Works via localStorage, but two competing storage keys |
| Post-onboarding redirect | PARTIAL | Correct for Relay; broken for Studio |
| Bypass-onboarding (admin) | PASS | Creates voice profile explicitly |

## NAVIGATION & IA

| Feature | Status | Notes |
|---------|--------|-------|
| Sidebar (desktop) | PASS | All primary links work |
| Mobile bottom nav | PARTIAL | 3 E2E failures (P1-15) |
| Mobile drawer | PASS | Functional |
| Command palette (⌘K) | PASS | All commands route correctly |
| Breadcrumbs | NOT IMPLEMENTED | No breadcrumb system |
| Deep links | PASS | Direct URL access works for most routes |
| Browser back/forward | PASS | Functional |
| Landing anchor links | BROKEN | Section IDs don't exist (P1-13) |

## LEAD / PROSPECT PIPELINE

| Feature | Status | Notes |
|---------|--------|-------|
| Prospect check (analyze) | PASS | Qualification gate works |
| Lead creation | PASS | Dedupe guard works |
| Lead list | PASS | Filtering, sorting functional |
| Lead detail | PASS | Score display fixed (canonical/legacy bridge) |
| Lead scoring | PARTIAL | Score floor inflation (P0-08), evidence fabrication (P0-04, P0-05) |
| Canonical intelligence | PASS | Input-hash reuse works |
| Person/company extraction | PASS | Comma-separated headlines, About-section prose added |
| Remote eligibility | PARTIAL | 8 points for NOT_APPLICABLE (P2-10) |
| Lead archival | PASS | Migration applied |
| Lead import | UNREACHABLE | Route exists, no nav link |

## BD OUTREACH / MESSAGING

| Feature | Status | Notes |
|---------|--------|-------|
| Draft generation (connection) | PASS | Stream draft works |
| Draft generation (DM) | PASS | Functional |
| Email outreach V1 | PASS | Full lifecycle verified |
| Follow-up engine | PARTIAL | 6h cooldown works; uses first DM not last (P2-21) |
| DM gating (connection required) | PASS | Functional with manual acceptance |
| Connection acceptance tracking | PASS | Migration applied, works |
| Log sent idempotency | PASS | Concurrency-tested |
| Message eligibility | PARTIAL | Follow-up cap duplicated (P2-22) |
| Sender profile selection | PARTIAL | Stored but not pre-selected (P2-13) |
| Voice/style injection | PARTIAL | Works for outbound; ignored by copilot (P1-06) |

## CONVERSATION COPILOT

| Feature | Status | Notes |
|---------|--------|-------|
| Inbound analysis | PASS | Intent, sentiment, questions detected |
| Conversation memory | PASS | Compacts history |
| Reply draft generation | PARTIAL | Functional but ignores style card (P1-06) |
| Conversation workspace | UNREACHABLE | `/conversations` exists but no nav link (P1-12) |
| Full conversation list | PARTIAL | `/relay` works; `/conversations` orphaned |

## YOUR MOVE / THEIR MOVE

| Feature | Status | Notes |
|---------|--------|-------|
| State computation | PARTIAL | No connection rejection state (P1-09) |
| Reply detection | PARTIAL | Any inbound treated as reply (P1-10) |
| Follow-up due detection | PARTIAL | Uses wrong reference point (P2-21) |
| State transitions | PARTIAL | Overlapping conditions (P1-10) |
| followUpDueLabel | NOT IMPLEMENTED | Field always null (P2-23) |

## REVENUE IDENTITY / PROFILES

| Feature | Status | Notes |
|---------|--------|-------|
| Identity creation | PASS | Admin can create |
| Identity assignment | PASS | Functional |
| Profile switching | PARTIAL | Changes proof but not voice (P1-07) |
| Per-profile voice | NOT IMPLEMENTED | Voice is per-rep only |
| Proof management | PASS | CRUD functional |
| Proof matching (semantic) | PASS | Embedding + tag merge |
| CV upload | PARTIAL | `tailored_cvs` table missing in prod (P1-18) |

## CONTENT STUDIO

| Feature | Status | Notes |
|---------|--------|-------|
| Persona creation | PASS | Onboarding extracts profile |
| Idea generation (daily) | PASS | Functional |
| Idea generation (v2 discover) | PASS | Taste scoring works |
| Draft generation | PASS | Forge produces candidates |
| Draft regeneration | PARTIAL | No feedback loop from previous failures |
| Draft persistence | PARTIAL | Orphaned from topic clusters (P2-05) |
| Taste learning | PARTIAL | `shortVsDeep` dead (P2-02); v1 ignores taste (P2-06) |
| Idea deduplication | PARTIAL | Title-only, misses paraphrases (P2-08) |
| Interview/onboarding questions | PASS | Functional |
| Quick capture | PARTIAL | E2E selector issues (P1-17) |
| Growth engine dashboard | UNREACHABLE | `/content/growth` no nav link |

## ADMIN / TEAM

| Feature | Status | Notes |
|---------|--------|-------|
| Command Center | PARTIAL | Fixed to read from daily_targets; was reading empty day_closes |
| People management | PASS | Functional |
| Revenue intelligence | PASS | Functional |
| AI usage analytics | UNREACHABLE | `/admin/ai-usage` no nav link |
| Targets management | PASS | Functional |
| Team live board | PARTIAL | Functional but depends on accountability data |
| Assignments | PASS | Functional |
| Admin `/admin` page | BROKEN | No page.tsx (P0-07) |

## ACCOUNTABILITY / TARGETS

| Feature | Status | Notes |
|---------|--------|-------|
| Daily targets | PASS | CRUD functional |
| Daily accountability | PASS | Records activity, tracks progress |
| Day close | PARTIAL | Infrastructure built but unpopulated for org |
| Monthly review | NOT IMPLEMENTED | Tables exist, no UI |
| Rewards | NOT IMPLEMENTED | Tables exist, no UI |
| Progress tracking | PASS | getMyTodayAccountability works |

## JOBS / UPWORK

| Feature | Status | Notes |
|---------|--------|-------|
| Job search (external APIs) | PARTIAL | 7 providers, all use mock data in dev |
| Job extraction | PASS | AI extraction works |
| Upwork proposal generation | PASS | Functional |
| Upwork job tracking | PASS | Status transitions work |
| CV generation | PASS | Resume generation works |

## NOTIFICATIONS / EVENTS

| Feature | Status | Notes |
|---------|--------|-------|
| Notification creation | PASS | Dedupe key works |
| Notification read/unread | PASS | Functional |
| Activity log | PASS | Records events |
| Relay events | PARTIAL | Idempotency fixed but `Date.now()` sourceEventId issue |

## PRE / PUBLIC

| Feature | Status | Notes |
|---------|--------|-------|
| Landing page | PASS | Sections render |
| Pricing page | PASS | Static content |
| Docs pages | PASS | All 15 doc routes work |
| Legal pages | PASS | Privacy, terms, etc. |
| OG image generation | PASS | Functional |
| Sitemap/robots | PASS | Functional |

---

## SUMMARY

| Status | Count |
|--------|-------|
| PASS | 32 |
| PARTIAL | 28 |
| BROKEN | 5 |
| UNREACHABLE | 6 |
| NOT IMPLEMENTED | 5 |

**Key:** The application has significant surface area that works (32 PASS), but 28 features have meaningful defects, 5 are broken, and 6 are unreachable from navigation. The broken features are concentrated in auth/session, onboarding, and navigation.

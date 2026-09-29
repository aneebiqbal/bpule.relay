# RELAY — LIVE SITE TEST PLAN

**URL:** https://relay.bpulse.dev (or your deployment)
**Test Account:** Create a fresh account for onboarding tests

---

## 1. AUTHORIZATION & ROLES (P0-A1)

### Test 1.1: Demoted user loses admin access
```
1. As admin: invite a second user (rep@scout.dev)
2. As admin: promote them to admin via /admin/people
3. As that user: verify you can access /admin/command-center
4. As admin: demote them back to MEMBER
5. As demoted user: refresh /admin/command-center
   EXPECTED: Redirected to /dashboard (no admin access)
```

### Test 1.2: New user has no admin access
```
1. Create brand new account
2. Try to access /admin/command-center
   EXPECTED: Redirected to /dashboard
```

---

## 2. SESSION LIFECYCLE (P0-A2)

### Test 2.1: Deleted user loses access
```
1. Create a test account, log in
2. Open browser DevTools → Application → Cookies
   Copy the sb-auth-token cookie value
3. Delete account via /account → Delete Account
4. Using the old cookie, try to call any API:
   fetch('/api/leads', { credentials: 'include' })
   EXPECTED: 401 or redirect to /login
```

### Test 2.2: Logout invalidates session
```
1. Log in, copy auth cookie
2. Log out
3. Use old cookie to call API
   EXPECTED: 401
```

---

## 3. RATE LIMITING (P0-A3)

### Test 3.1: Signup rate limit
```
1. Attempt 6+ rapid signups from same IP (use incognito + signup page)
   EXPECTED: 6th attempt shows "Too many attempts" (429)
```

---

## 4. AI EVIDENCE INTEGRITY (P0-B1, P0-B2)

### Test 4.1: Zero-evidence profile scores low
```
1. Go to /prospect
2. Paste: "John Smith lives in New York. He enjoys hiking."
3. Run analysis
   EXPECTED: Score < 20 (no fabricated evidence, no score floor)
```

### Test 4.2: No scoring dimensions in evidence
```
1. Analyze any prospect
2. Open lead detail → Evidence tab
   EXPECTED: No evidence entries with source "inferred" and ownership "BUYER_INTENT"
   (Evidence should only contain FACT or EXPLICIT_SIGNAL)
```

### Test 4.3: Hiring-only doesn't fabricate need
```
1. Paste a job posting that says "We're hiring a senior developer"
   but doesn't mention external delivery/contracting
2. Check the prospect's probableNeed
   EXPECTED: Should be null or very generic, NOT
   "Company X appears to need full-stack delivery capacity"
```

### Test 4.4: Strong buyer signal scores high
```
1. Paste: "We're looking for a dev shop to build our MVP.
   Budget $50k. Need React + Node. Start next month."
2. Run analysis
   EXPECTED: Score > 50, evidence shows explicit_ask + hiring signals
```

---

## 5. STUDIO ONBOARDING (P0-C1)

### Test 5.1: Studio onboarding requires voice profile
```
1. Create new account → complete Relay onboarding
2. Go to /content/new (Studio onboarding)
3. Complete all steps → Complete setup
   EXPECTED: Redirects to /content/{id}/today successfully
   (No infinite redirect loop)
```

### Test 5.2: API guard prevents orphaned persona
```
1. Authenticated as user WITHOUT voice profile
2. Call POST /api/content/onboarding/complete directly
   EXPECTED: 422 with error "Relay onboarding required"
```

---

## 6. ADMIN ROUTE (P0-C2)

### Test 6.1: /admin redirects correctly
```
1. As admin, navigate to /admin
   EXPECTED: Redirects to /admin/command-center
```

---

## 7. LOGIN RELIABILITY (P1-02)

### Test 7.1: Login works on slow network
```
1. Open DevTools → Network → Throttle to "Slow 3G"
2. Log in with valid credentials
   EXPECTED: Login succeeds (no false "cookie blocked" error)
   Note: May take up to 5 seconds for session detection
```

---

## 8. CONVERSATION COPILOT VOICE (P1-06)

### Test 8.1: Reply uses calibrated voice
```
1. During onboarding, set voice: casual, short sentences, "Hey" greeting
2. Generate a connection note → verify casual tone
3. As the lead: simulate an inbound reply
4. Open Conversation Copilot
   EXPECTED: Reply draft uses casual tone, short sentences, matches your voice
   NOT generic formal language
```

### Test 8.2: Voice fields are injected
```
1. Check browser Network tab during copilot reply generation
2. Inspect the prompt sent to /api/inbound/reply
   EXPECTED: Prompt contains your calibrated voice fields
   (contractions, formality, sentence rhythm, greeting, sign-off)
```

---

## 9. VOICE PER-PROFILE (P1-07)

### Test 9.1: Different profiles can have different voices
```
1. As admin, create two revenue identities with different personas
2. Assign both to your rep
3. Generate connection notes for each
   EXPECTED: Drafts reflect different proof/identity per profile
   (Full voice-per-profile calibration requires per-profile calibration UI
   — infrastructure is in place but UI flow is future work)
```

### Test 9.2: profile_id column exists
```
1. Run in Supabase SQL Editor:
   select column_name from information_schema.columns
   where table_name = 'voice_profiles' and column_name = 'profile_id';
   EXPECTED: 1 row returned
```

---

## 10. CONNECTION STATE MACHINE (P1-09, P1-10)

### Test 10.1: Connection timeout after 14 days
```
1. In Supabase, manually set a lead's connection message sent_at to 15 days ago:
   update messages set sent_at = now() - interval '15 days'
   where type = 'connection' and lead_id = '<your-lead-id>';
2. Open the lead in Relay
   EXPECTED: State shows "Connection expired" (not "Waiting for connection")
```

### Test 10.2: Rejection detected
```
1. Create a lead with a connection sent
2. Add an inbound message with text "Not interested, thanks"
   (via Supabase: insert into messages...)
3. Open the lead in Relay
   EXPECTED: State shows "Client not interested" (not "They replied — respond now")
```

### Test 10.3: Auto-reply handled
```
1. Add inbound message "I am currently out of office until next week"
2. Open the lead
   EXPECTED: Shows "Client not interested" with detail about auto-reply
```

### Test 10.4: Genuine reply still triggers YOUR MOVE
```
1. Add inbound message "Thanks for reaching out! I'd love to learn more.
   Can you tell me about your process?"
2. Open the lead
   EXPECTED: State shows "They replied" with "Prepare Reply" CTA
```

---

## 11. NAVIGATION (P1-12, P1-13)

### Test 11.1: /conversations redirects
```
1. Navigate to /conversations
   EXPECTED: Redirects to /relay
```

### Test 11.2: Landing page anchors work
```
1. Go to landing page (relay.bpulse.dev)
2. Click "Product" in nav → scrolls to product section
3. Click "Intelligence" → scrolls to intelligence section
4. Click "Conversations" → scrolls to conversation section
   EXPECTED: Each anchor scrolls to the correct section (no jump to top)
```

---

## 12. PROFILE SELECTION PERSISTS (P2-13)

### Test 12.1: Lead remembers selected profile
```
1. Open a lead with multiple profiles assigned
2. Select a non-default profile
3. Generate a connection note
4. Refresh the page
5. Reopen the lead
   EXPECTED: Profile selector shows the previously selected profile
   (not reset to profiles[0])
```

---

## 13. FORGE CONTENT QUALITY (P1-08)

### Test 13.1: No duplicate content
```
1. In Studio, generate a draft
2. Check the forge result (in Network tab response)
   EXPECTED: candidateA and candidateB are different (when both generated)
   NOT the same content in both slots
```

---

## 14. RESPONSIVE / MOBILE

### Test 14.1: Core flow at 390px
```
1. Open DevTools → Toggle device toolbar → iPhone SE (390px)
2. Log in → Dashboard → Leads → Add prospect
   EXPECTED: No horizontal overflow, all buttons accessible,
   text readable, no clipped navigation
```

### Test 14.2: Sidebar usable on tablet
```
1. Set viewport to 768px
2. Open sidebar
   EXPECTED: All nav items visible, clickable
```

---

## 15. SECURITY FINAL CHECKS

### Test 15.1: Cross-org API access blocked
```
1. As Org A user, get your auth token from cookies
2. Try to access Org B's data:
   fetch('/api/leads/<org-b-lead-id>', { credentials: 'include' })
   EXPECTED: 404 or 403 (not 200 with Org B's data)
```

### Test 15.2: Service role not exposed
```
1. Check all client-side JS bundles for "SERVICE_ROLE_KEY"
   EXPECTED: Not found (never exposed to browser)
```

### Test 15.3: No client-supplied org_id trusted
```
1. Try POST /api/prospect/save with a different organization_id in body
   EXPECTED: Saved under YOUR org (from session), not the supplied one
```

---

## BROWSER DEVTOOLS QUICK CHECKS

### Network Tab
```
1. Generate any AI content
2. Check the API response for trace/telemetry
   EXPECTED: feature and callSite are meaningful strings, not "unknown"
```

### Console Tab
```
1. Navigate the app
   EXPECTED: No uncaught errors, no "[object Object]" error messages,
   no raw Postgres error codes exposed
```

### Application Tab → Cookies
```
1. After login, check cookies
   EXPECTED: sb-auth-token present, httpOnly, sameSite=lax
```

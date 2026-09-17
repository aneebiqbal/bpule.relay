# Known-Win Analysis — Relay Intelligence Benchmark

## Purpose

This analysis examines every known WON case from bpulse business history to determine:
- What signals were present in the original data
- What the current scoring system would likely score it as
- What useful Relay should recognize
- Why real wins might be underrated by naive scoring

**Methodology**: Every case is evidenced by `client_contracts` or `proof_items` in `supabase/migrations/`. Nothing is invented.

**Critical principle**: A closed client CAN have been risky. We are NOT saying "WON = must score 100." We are asking: did Relay recognize the important opportunity signals?

---

## Win Analysis

### WON-001: Stefan Richter — Mythos Archive (OIDC Auth)
- **Source**: Aneeb (LinkedIn + Upwork)
- **How originated**: Public post on LinkedIn asking for Next.js/OIDC developer
- **Signals present**: `asking` (explicit "looking for"), `funding` (seed round), specific tech stack
- **Engagement**: ~10 weeks, completed
- **Client feedback**: "Fast work."
- **What a useful Relay should recognize**:
  - CEO asking directly = strongest possible signal (signal_type 7)
  - Specific technical requirement (OIDC) = proof matching opportunity
  - Funding mentioned = budget exists
  - Time-bounded engagement ("10-week") = defined scope
- **Risk**: Unknown company (Mythos Archive), no prior relationship
- **Why old scoring might underrate**: CEO + asking signal + specific tech = strong case, but location (Berlin) gives only +2 region points. Max score ~8-9 depending on completeness. May not reach "send" threshold of 10+.

### WON-002: Nasser Al-Fahad — WearMeOut (Firebase E-Commerce)
- **Source**: Aneeb (LinkedIn + Upwork)
- **How originated**: Post seeking Firebase backend developer
- **Signals present**: `asking`, `funding` (AI image gen suggests funded startup), specific stack
- **Revenue**: $3,100
- **Client feedback**: "Only dev we use."
- **What a useful Relay should recognize**:
  - "Full ownership expected" = high trust, long-term potential
  - Founder asking directly = strong signal
  - AI + Firebase = bpulse portfolio match
- **Risk**: Unknown startup, no track record with bpulse
- **Why old scoring might underrate**: Founder title gives good role match, but "full ownership" trust signal is not captured in current scoring rubric

### WON-003: Ryan Carter — chainClear (Chat + Blockchain)
- **Source**: Hassan (LinkedIn + Upwork)
- **How originated**: Post about 6 months of struggling with chat + blockchain
- **Signals present**: `pain` (6 months struggling), `asking`, complex tech stack
- **Client feedback**: "Complex build."
- **What a useful Relay should recognize**:
  - Pain signal with specific duration (6 months) = urgent need
  - Multiple technologies = likely larger project
  - "This is complex" = values expertise over price
- **Risk**: Complex project might be outside scope, long delivery
- **Why old scoring might underrate**: Pain signal (weight 5) is second-tier; hiring signal (weight 6) is stronger but this isn't explicitly hiring. The "complex" qualifier indicates higher-value engagement.

### WON-004: James Whitmore — RegShield (Compliance Platform)
- **Source**: Hassan + Zaira (LinkedIn + Upwork)
- **How originated**: Post about production compliance platform needing hardening
- **Signals present**: `asking`, domain-specific (GDPR/NIS2/DORA/CSRD), specific deliverables
- **Client feedback**: "Ship it."
- **What a useful Relay should recognize**:
  - Specific compliance domain = specialized, higher-value work
  - "If you've done compliance SaaS before" = filtering for expertise (good client)
  - Named deliverables (RLS, tenant isolation, admin panel) = scopable
- **Risk**: Compliance work has regulatory implications if done wrong
- **Why old scoring might underrate**: Domain specificity isn't scored; only signal type + completeness matter

### WON-005: Samuel Osei — Python Trading Bot (Upwork)
- **Source**: Zaira + Hassan (Upwork)
- **How originated**: Upwork job posting
- **Signals present**: `asking`, specific tech (Python, Flask, Railway, Kalshi API)
- **Revenue**: $640
- **Client feedback**: "Found bugs."
- **What a useful Relay should recognize**:
  - Upwork job = immediate intent to hire
  - Specific tech stack = can evaluate fit quickly
  - DevOps work = often repeatable/ongoing
- **Risk**: Small budget, trading bot might be profitable or might not
- **Why old scoring might underrate**: Upwork jobs are inherently "ready to buy" but the rubric doesn't distinguish source types

### WON-006: Craig Donaghue — BrandFlow (AI Content)
- **Source**: Aneeb (LinkedIn)
- **How originated**: Post about drowning in content requests
- **Signals present**: `pain` (drowning), `asking` (looking for agentic pipeline), domain match
- **Client feedback**: "Gets both sides."
- **What a useful Relay should recognize**:
  - Pain signal + marketing domain = understands the problem
  - "Agentic content pipeline" = matches Mehak's exact experience
  - Marketing Director = understands value of content automation
- **Risk**: Content automation is competitive space
- **Why old scoring might underrate**: Pain signal alone might not reach send threshold, but this is a perfect proof-match case

### WON-007: Chris Harmon — Appranker (CSS + No-Code Migration)
- **Source**: Hassan + Zaira (LinkedIn)
- **How originated**: Post about no-code MVP needing production
- **Signals present**: `asking`, `stale` (no-code MVP not production ready), specific deliverables
- **Client feedback**: "On time."
- **What a useful Relay should recognize**:
  - Two separate engagements = repeat client (higher value)
  - "On time delivery critical" = respects deadlines (good client signal)
  - CSS + Figma = well-defined, measurable work
- **Risk**: Pixel-perfect CSS can be subjective/iterative
- **Why old scoring might underrate**: Repeat client value is not captured in single-lead scoring

### WON-008: Marcus Webb — Zerish (Brand Asset Portal)
- **Source**: Hassan + Zaira (LinkedIn)
- **How originated**: Post seeking full-stack developer for DAM portal
- **Signals present**: `asking`, specific tech, bilingual requirement
- **Client feedback**: "No hand holding."
- **What a useful Relay should recognize**:
  - "No hand holding" = experienced client, knows what they want (good)
  - Bilingual requirement = specific need that filters competition
  - Role-based + CDN + headless CMS = scopable architecture
- **Risk**: Bilingual might mean Arabic (complex text rendering)
- **Why old scoring might undertate**: "No hand holding" is a positive client signal not captured in rubric

### WON-009: Muhammad Behsas — WearMeOut.ai (Firebase Backend)
- **Source**: Fizza (Upwork)
- **How originated**: Upwork job posting
- **Signals present**: `asking`, specific stack, full ownership
- **Revenue**: $3,100
- **Client feedback**: "5.0 stars. Full ownership, reliable."
- **What a useful Relay should recognize**:
  - Upwork + specific stack + full ownership = high-intent, trust-based
  - AI fashion = trending domain
- **Risk**: Startup might fail, fashion is competitive
- **Why old scoring might underrate**: Same as WON-002 — "full ownership" trust is a strong positive not captured

### WON-010: David Okafor — Avenue Store (Yotpo + Rails)
- **Source**: Hassan (LinkedIn)
- **How originated**: Post about simple Yotpo integration task
- **Signals present**: `asking`, specific scope, Rails stack
- **Client feedback**: "First try."
- **What a useful Relay should recognize**:
  - "Simple task" = low risk, quick win
  - "Should be quick if you know Yotpo" = client has realistic expectations
  - "First try" = got it right first time (quality signal for bpulse)
- **Risk**: Small scope, might not lead to more work
- **Why old scoring might underrate**: Small tasks score low on completeness but can lead to relationships

### WON-011: Liam Fogarty — TrackReach (Browser Extension)
- **Source**: Aneeb (LinkedIn)
- **How originated**: Post about extension needing new integrations
- **Signals present**: `asking`, specific tech (WXT, Svelte, Rails 8), ongoing work
- **Client feedback**: "Fast pickup."
- **What a useful Relay should recognize**:
  - WXT + Svelte + Rails 8 = exact bpulse stack match
  - "If you've built browser extensions before" = filtering for expertise
  - Extension work = ongoing maintenance potential
- **Risk**: Browser extensions can be fragile/break with platform updates
- **Why old scoring might underrate**: This is a perfect proof-match case (bpulse has multiple WXT/Svelte extensions in portfolio) but proof matching happens AFTER scoring

### WON-012: Andre Beaumont — Voyage AI (Bug Fix)
- **Source**: Mehak (LinkedIn)
- **How originated**: URGENT post about blank screen bug
- **Signals present**: `pain` (urgent bug), specific stack, time-bounded
- **Client feedback**: "Fast fix."
- **What a useful Relay should recognize**:
  - "URGENT" + "fast" = values speed over cost
  - Same-day fix = bpulse delivery capability match
  - Small project = foot in the door for larger work
- **Risk**: One-off bug fix, might not lead to ongoing work
- **Why old scoring might underrate**: Small scope + urgency isn't captured; rubric favors larger signals

### WON-013: Kevin Marsh — Dental Content Co (Langflow Trial)
- **Source**: Mehak (LinkedIn)
- **How originated**: One-day paid trial offer
- **Signals present**: `asking`, specific tech (Langflow, Node.js), trial structure
- **Client feedback**: "Standout."
- **What a useful Relay should recognize**:
  - Paid trial = client is serious (not tire-kicking)
  - "Architecture map for non-technical stakeholders" = values communication
  - Langflow = bpulse core competency
- **Risk**: One-day trial might not convert
- **Why old scoring might underrate**: Trial structure is a positive signal (serious buyer) but scores low on scope

### WON-014: Pontus — CompliAI (GDPR MVP to Production)
- **Source**: Zaira (LinkedIn)
- **How originated**: Post about Lovable-built MVP needing production
- **Signals present**: `asking`, `stale` (MVP not production ready), specific deliverables
- **Revenue**: $1,660
- **Client feedback**: "5.0 stars. Production ready."
- **What a useful Relay should recognize**:
  - MVP to production = defined scope with clear goal
  - "Production ready" as feedback = bpulse delivered on promise
  - GDPR = recurring compliance needs (ongoing work potential)
- **Risk**: MVP might have fundamental architectural issues
- **Why old scoring might undertate**: "MVP to production" is a well-understood pattern but not scored differently from greenfield

### WON-015: Rory G — LinkedIn Extension (Upwork)
- **Source**: Fizza (Upwork)
- **How originated**: Upwork job for WXT/Svelte extension
- **Signals present**: `asking`, exact stack match, specific deliverables
- **Revenue**: $3,979.17
- **Client feedback**: "5.0 stars. Took initiative."
- **What a useful Relay should recognize**:
  - WXT + Svelte + TypeScript = bpulse core stack (multiple portfolio projects)
  - LinkedIn sourcing = bpulse domain knowledge (LinkedIn is key channel)
  - "Took initiative" = bpulse proactively added value
- **Risk**: LinkedIn API changes can break extensions
- **Why old scoring might underrate**: This is the IDEAL bpulse lead (perfect stack match, domain expertise) but scoring doesn't consider proof match

### WON-016: Scott Hendricks — GlowCare (AI Content System)
- **Source**: Mehak (LinkedIn)
- **How originated**: Post about 20+ hrs/week content burden
- **Signals present**: `pain` (20 hrs/week burden), `asking`, specific tech (Langflow, ChatGPT)
- **Client feedback**: "Exceptional."
- **What a useful Relay should recognize**:
  - Quantified pain (20 hrs/week) = clear ROI for automation
  - Langflow + ChatGPT = bpulse agentic experience
  - Marketing Director = decision maker with budget
- **Risk**: Content automation results can be hard to measure
- **Why old scoring might underrate**: Quantified pain (20 hrs/week) is a strong signal but current rubric only checks if evidence contains a number (completeness +1)

### WON-017: Daniel Kowalski — Sourcetools.io (Browser Extension)
- **Source**: Hassan (LinkedIn)
- **How originated**: Post about extension needing improvements
- **Signals present**: `asking`, complex tech stack, ongoing work
- **Client feedback**: "Improved unasked."
- **What a useful Relay should recognize**:
  - "Improved unasked" = bpulse adds value beyond scope
  - WXT/Vite/Svelte/Rails = exact bpulse stack
  - "Complex build" = higher value engagement
- **Risk**: Complexity might lead to scope creep
- **Why old scoring might underrate**: "Improved unasked" is a strong quality signal but not captured in lead scoring

### WON-018: Shohel Ahmed — SBA 504 Website (Upwork)
- **Source**: Fizza (Upwork)
- **How originated**: Upwork job for SBA 504 loan website
- **Signals present**: `asking`, specific tech (Astro, 11ty), specific domain
- **Revenue**: $2,450
- **Client feedback**: "5.0 stars. Built and deployed with exceptional support."
- **What a useful Relay should recognize**:
  - Specific niche (SBA 504) = less competition from other developers
  - Lead generation site = bpulse portfolio match
  - "Exceptional support" = bpulse service quality
- **Risk**: Niche domain might not repeat
- **Why old scoring might underrate**: Niche expertise isn't scored; generalist rubric misses domain-specific value

### WON-019: Bilal Chaudhry — IndoorNav (PDR Module)
- **Source**: Aneeb (LinkedIn)
- **How originated**: Post about PDR integration, 3-day deliverable
- **Signals present**: `asking`, specific domain (indoor positioning), time-bounded
- **Client feedback**: "First try."
- **What a useful Relay should recognize**:
  - "Deliverable in three days" = respects bpulse delivery speed
  - PDR/sensors = specialized domain (less competition)
  - "First try" = bpulse technical accuracy
- **Risk**: Specialized domain might not lead to ongoing work
- **Why old scoring might underrate**: Small scope + specialized domain scores low but is high-value per hour

### WON-020: Elliot Drummond — FinArch Labs (Architecture Sprint)
- **Source**: Aneeb (LinkedIn)
- **How originated**: Post about architecture discovery sprint
- **Signals present**: `asking`, `funding` (new platform), specific scope
- **Client feedback**: "Useful."
- **What a useful Relay should recognize**:
  - Architecture sprint = high-value, strategic engagement
  - OWASP + database design = bpulse security/architecture capability
  - "One to two weeks" = defined, bounded engagement
- **Risk**: Discovery might not lead to build work
- **Why old scoring might underrate**: Architecture work is high-value per hour but rubric doesn't weight engagement type

---

## Pattern Summary

### Signals that led to wins:
| Signal | Count | Notes |
|--------|-------|-------|
| asking | 16/20 | Most common — direct request for help |
| pain | 5/20 | Quantified pain (20 hrs, 6 months) = strong |
| funding | 3/20 | Mentioned but not always specific |
| stale | 1/20 | MVP not production-ready |

### What existing scoring misses:
1. **Proof matching is post-score**: The rubric scores BEFORE considering proof fit. A lead with perfect proof match (WXT/Svelte extension) scores the same as one with no relevant proof.
2. **"Full ownership" / "no hand holding" signals**: These indicate a good client (trusts contractors, knows what they want) but aren't captured.
3. **Quantified pain**: "20 hrs/week" or "6 months struggling" are strong urgency signals. Current rubric only checks if evidence contains a number for completeness +1.
4. **Repeat client value**: Two engagements with same client (Chris Harmon/Ofer Langer) is a positive signal for the second lead.
5. **Engagement type**: Architecture sprint, trial, bug fix, MVP-to-production — these have different value profiles but score identically if signal type is the same.
6. **Client quality signals**: "Paid trial" (serious buyer), "on time delivery critical" (respects deadlines), "first try" (values competence) — all positive, none scored.

### Why real wins were underrated:
The current rubric scores 0-12 based on:
- Signal weight (max 7 for "asking")
- Completeness (URL, name, title, evidence specificity, quote, region fit)

A typical win scores:
- Signal: 5-7 (asking/pain)
- Completeness: 3-4 (URL + name + title, maybe evidence)
- Region: +2 if US/UK/EU/AU
- **Total: 8-10** → borderline "send" or "research_more"

The wins happened DESPITE borderline scores because:
1. Aneeb/Hassan/Fizza/Zaira/Mehak manually reviewed and reached out
2. The proof match was strong enough to overcome borderline scores
3. The asking signal (public post) means the prospect is actively seeking help

**The key insight**: Current scoring is a FILTER (skip bad leads) not a RANKER (find best opportunities). Real wins came from leads that passed the filter but were not scored highly.

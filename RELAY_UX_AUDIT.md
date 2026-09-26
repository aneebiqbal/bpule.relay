# Relay UX Audit — Product Refinement

**Baseline:** `6c50b1b`
**Date:** 2026-09-26
**Method:** DOM audit across 17 routes at 1440×900 + 390×844, plus code-level component audit.

---

## Design System Preserved

Ink #1C1917 · Bone #F5F0E8 · Signal Orange #d4652f · Dark Card #252220 · Mid Surface #2E2B28 · Muted #9E9790 · Dim #6B6560

Orange = PRIMARY ACTION / IMPORTANT STATE / ATTENTION (not scores, not statuses)

---

## Findings by Page

### /dashboard (MEMBER)
**Purpose:** Daily execution. What should I do now?
**Role:** Rep/Manager
**Problems:**
- Do This Next is clear but surrounding context is sparse
- Daily Jobs section needs compact density
- "Day off" state should be calmer
**Priority:** UX-P2

### /relay (Conversations)
**Purpose:** Action queue for all outreach/replies.
**Role:** Rep
**Problems:**
- Top item elevation is correct per frozen QA
- Remaining items could be more compact
- What/Why/Evidence labels already fixed
**Priority:** UX-P2

### /leads
**Purpose:** Scan, filter, and act on leads.
**Role:** Rep
**Problems:**
- 47 orange elements — extreme pollution (ScoreRing mid-scores + StatusBadge "new")
- Score rings use orange for mid-range scores (58-83%)
- "New" status badge uses orange
- Filter bar works but could be more compact
**Priority:** UX-P0 (visual hierarchy broken)

### /content (Studio)
**Purpose:** Content creation.
**Role:** Rep/Admin
**Problems:**
- Minimal content — just heading + Continue button
- Needs workflow clarity: Ideas → Generate → Visual → Final
**Priority:** UX-P2

### /profiles
**Purpose:** Revenue Identity management.
**Role:** Rep/Admin
**Problems:**
- Minimal information hierarchy
- Channel distinction needs to be unmistakable
**Priority:** UX-P2

### /facts (Proof)
**Purpose:** Evidence library.
**Role:** Rep
**Problems:**
- Dense but functional
- Proof cards need clearer what/who/when structure
**Priority:** UX-P2

### /inbound
**Purpose:** Waiting replies and inbound messages.
**Role:** Rep
**Problems:**
- Empty state needs clear action
**Priority:** UX-P2

### /upwork (Jobs)
**Purpose:** Job pipeline and applications.
**Role:** Rep
**Problems:**
- Job cards need: title, company, remote, fit, identity, status, next action
- Proposal/Apply flow clarity
**Priority:** UX-P1

### /find-jobs
**Purpose:** Discover and qualify Upwork jobs.
**Role:** Rep
**Problems:**
- Results should show qualification at a glance
**Priority:** UX-P2

### /admin/command-center
**Purpose:** "What needs my attention?"
**Role:** Manager/Admin
**Problems:**
- Currently shows rep view ("YOUR DAY") for all roles in test — needs role-gated rendering verification
- Should prioritize: waiting replies, at-risk reps, blocked operators
**Priority:** UX-P1

### /admin/people
**Purpose:** Team overview.
**Role:** Admin
**Problems:**
- Needs: role, team, identities, channels, onboarding, today state
- Bypass button competes with normal actions
**Priority:** UX-P2

### /admin/revenue-intelligence
**Purpose:** Analysis, not execution.
**Role:** Admin
**Problems:**
- Chart soup risk
- Each number needs canonical source
**Priority:** UX-P2

---

## Shared UX Problems

### 1. Orange Pollution (UX-P0)
Orange used for: primary actions, mid-range scores, status badges, nav states, borders, focus rings
→ Fixed: ScoreRing mid-scores now use bone/line. StatusBadge "new" now neutral.

### 2. Inconsistent Card Density (UX-P2)
Some pages use spacious cards, others cramped. No shared spacing scale.

### 3. Empty States (UX-P2)
Many pages lack intentional empty states with clear next actions.

### 4. Mobile Responsiveness (UX-P1)
Tables need card transformation on mobile. Filters need mobile-friendly layout.

### 5. Action Hierarchy (UX-P2)
Multiple competing actions on some screens. Primary action should dominate.

### 6. Typography Hierarchy (UX-P2)
Some pages lack clear heading → section → body → metadata hierarchy.

---

## Implementation Priority

1. **Shared primitives** — spacing, card, typography standardization
2. **Orange hierarchy** — restrict orange to primary actions only
3. **/leads** — fix orange pollution, improve density
4. **Empty/loading/error states** — every page
5. **Mobile** — responsive transformations
6. **Page-by-page polish** — hierarchy, spacing, action placement

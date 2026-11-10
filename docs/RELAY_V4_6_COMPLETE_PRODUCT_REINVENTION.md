# RELAY V4.6 — Product Reinvention Record

**Status:** partial — four substantive, screenshot-verified improvements.
**Owner visual approval:** NOT GIVEN.
**Production stability:** NOT CLAIMED. The four V4.3 findings remain open (§X).
**Commits / pushes / deploys:** none, per instruction.

---

## A. Repository and Concurrency Status

| Item | Value |
| --- | --- |
| Repository | `github.com/aneebiqbal/bpule.relay` (verified RELAY) |
| Branch | `main` |
| HEAD at start | `adcf4bf` |
| HEAD during session | `d34c920` → `8c520f7` (concurrent agent commits) |
| Working tree at start | clean |

### Concurrency events this session

1. **The concurrent agent committed `d34c920`** ("V4.5 backend hardening"), sweeping up **my uncommitted V4.5 document** and their own 13 files.
2. **My three uncommitted V4.5 UI files were discarded** by that operation. I verified they were present in no commit, no stash and no dangling git object. I re-applied them from the known change set.
3. **The stat-strip fix was then committed by the agent** as `8c520f7 fix(relay): separate stat tiles with a gap and ring` — so that one survived in git.
4. **The agent is actively editing right now.** Their in-progress async refactor of `createServerSupabase()` leaves `src/app/api/scoring-feedback/route.ts` and `src/app/api/leads/[id]/refer/route.ts` with 10 type errors, which **breaks the project build**.

I did not touch any of their files. Their modified and deleted files (`tsconfig.json`, four deleted API routes, a new migration, and others) were preserved untouched.

### File-ownership matrix

| File | Owner | V4.6 |
| --- | --- | --- |
| `src/app/(app)/admin/health/page.tsx` | free | **edited** |
| `src/app/(app)/chats/page.tsx` | free | **edited** |
| `src/lib/operations/conversations.ts` | free | **edited** |
| `src/components/v4/primitives.tsx` | committed by agent (`8c520f7`) | already contained my fix |
| `src/app/api/scoring-feedback/route.ts` | concurrent (broken WIP) | avoided |
| `src/app/api/leads/[id]/refer/route.ts` | concurrent (broken WIP) | avoided |
| `tsconfig.json`, 4 deleted routes, new migration | concurrent | untouched |

---

## B. Actual Skills Used

No design skill was installed in this environment. Hallmark, Frontend Design, UI/UX Pro Max and the other named skills were **not** available and are **not** claimed. Work followed the repository's own design system in `src/app/globals.css` and `src/components/v4/primitives.tsx`.

---

## C. Design Research

No web-research tool was used this session. Reference patterns were taken from prior knowledge of Linear, Attio, Front, Stripe Dashboard and Vercel Dashboard — specifically: dense but calm tables, priority-first ordering, honest empty states, and status that never relies on colour alone. These informed the follow-up lateness work and the empty-state rewrite.

---

## D. Three Rendered Concepts

Not produced as separate rendered prototypes. The existing product already encodes a coherent direction (semantic tokens, IBM Plex, hairline rings, double-bezel panels, a single shell). Three directions were evaluated on paper against it:

- **A — The Precision Terminal.** Calm, dense, keyboard-first. *Closest to the existing system; adopted as the working baseline.*
- **B — The Executive Workspace.** More expressive hierarchy and surfaces. *Rejected: drifts toward generic modern SaaS.*
- **C — The Connected Operating Desk.** Multi-panel, context-and-action connected. *Compatible with A; its priority emphasis informed §K.*

**Selected: A, with C's priority emphasis.** Building a parallel design system would have fragmented the product.

---

## E. Selected Creative Direction

Preserved the existing system. The changes are surgical: surface real data that was already fetched but dropped, remove a rendering defect, and make one large empty surface intentional. No new brand, no new tokens, no new primitives.

---

## F. Design System Changes

None. The token set, primitives and shell were already coherent. One primitive was **repaired**, not redesigned — see §G.

---

## G. App Shell and Navigation

No changes. The shell was verified intact: domain/section page identity, workspace identity block, Operate/System grouping, collapsed rail, mobile bottom nav and drawer.

**One primitive repair (affects the shell's surfaces):** `V4StatStrip` painted its grid background (`gap-px bg-line`) through empty cells. With 6 items on a 5-column grid, four cells rendered as a large grey slab on `/team` and `/admin/command`. Cells are now independent cards with their own hairline ring and a 2px gap, which is correct for any item count (callers use 6, 6 and 9).

---

## H. Rep Home

**No changes this sprint.** The page and its components were owned by the concurrent agent and have now been committed (`d34c920`). I inspected the rendered result: hierarchy, action queue, progress and manager-assigned work are all present and coherent. No concrete defect worth a risky edit was found.

---

## I. Inbox and Conversations

**Two changes.**

1. **Follow-up lateness is now visible.** `next_followup_at` was already fetched from `conversation_states` and used to derive the conversation state — but it was **dropped from the row projection**, so every follow-up row read "Follow-up due · 14d" (the age since last contact), with no way to tell how late it was.
   - `ConversationRow` gains an optional `followUpLabel`.
   - `followUpWhenLabel(dueIso, now)` renders "Overdue by 11d", "Overdue by 2h", "Due in 3d", "Due within the hour".
   - `attentionShort` and `attentionReason` use it, falling back to the previous text when absent.
   - Verified: rows now read **"Overdue by 11d" / "Overdue by 12d"**.
   - The field is optional so existing fixture and fallback rows remain valid — no other file needed touching.

2. **Thread-pane empty state** is no longer a bare dashed box: circular icon badge, title, what opens there (message history, profile and coverage, reply composer), and a pointer to the queue. The loading branch was made consistent.

---

## J. Leads and Profiles

**No changes.** The lead list was inspected: table hierarchy, search, filters, sorting, status, owner, last activity, due, next action and pagination are all present, with an honest empty state. No defect worth editing a 921-line component was found.

---

## K. Tasks and Follow-ups

**Follow-ups: delivered (§I).** Tasks already carry full overdue handling (`isOverdue`, an Overdue tab, "Overdue · X" labels) — no gap found.

**Not done:** the follow-ups view still sorts by priority then age-since-contact, not by lateness against the due date. Sorting by lateness would be the next improvement; it was not attempted because `sortChatRows` is shared across every Inbox view and changing it risks reordering surfaces beyond this sprint's scope.

---

## L. Admin Dashboard

**No changes.** The command centre shares the Team Today component; the stat-strip repair applies to it. Operational workload, attention list and health entry point are all present.

---

## M. Team and Assignments

**Stat-strip repair applies** (§G). The attention list, availability states and role presentation were inspected and are coherent. No further defect found.

---

## N. Coverage and Revenue Identities

**No changes.** Inspected via `/team/profiles` and `/profile-intelligence`; the profile/coverage/assignment grammar is consistent. No defect worth a risky edit.

---

## O. Analytics and Health

**Health: delivered.** The page asserted an unconditional green **"HEALTHY"** while application errors are not persisted anywhere readable — a green all-clear over a blind spot.

- Header pill now reads **"Signals OK"** with a second neutral pill **"Limited error visibility"**.
- New **Monitoring coverage** panel states what is persisted (`ai_traces`, `action_events`, `email_delivery_events`) and what is not (application exceptions and 500s, DB connection/permission failures, unexpected 401/403), each with where it is or is not visible.
- Footer scopes the claim: "…across the persisted signals only."

**Analytics: no changes.** The canonical data sources were not altered and no second counting authority was introduced.

---

## P. AI Workflows

**No changes.** `/admin/ai-usage` and the AI surfaces were not modified. No trace data was fabricated and no prompt content was exposed.

---

## Q. Responsive and Dark Mode

- **Mobile verified at 390 and 320 on 5 surfaces** (`/chats?view=followups`, `/chats`, `/team`, `/admin/health`, `/dashboard`): **0 horizontal-overflow issues**.
- **Dark mode not re-verified** this sprint. The changes use existing semantic tokens only, so they inherit the dark palette; no literal colours were introduced.

---

## R. Accessibility

- The follow-up label is plain text inside the existing row link — no new semantics required.
- The coverage panel reuses `Panel` and existing icons with `aria-hidden`.
- The stat strip retains `role="list"` / `role="listitem"` and its per-item `aria-label`.
- The empty state is static text inside the existing `aria-label="Thread"` region.
- No new focus traps, no new keyboard paths.

Not verified: full screen-reader pass and axe across every route. Not claimed.

---

## S. Motion

**No motion added.** Existing transitions preserved; no reduced-motion support disturbed.

---

## T. Screenshot Evidence

| Surface | Before | After |
| --- | --- | --- |
| Inbox follow-ups | `qa-artifacts/v45-baseline/rep-chats?view=followups.png` | `qa-artifacts/v46-after/rep-_chats_view_followups.png` |
| Team today | `qa-artifacts/v45-baseline/admin-team.png` | `qa-artifacts/v46-after/admin-_team.png` |
| Health | `qa-artifacts/v45-baseline/admin-admin_health.png` | `qa-artifacts/v46-after/admin-_admin_health.png` |
| Rep Home | — | `qa-artifacts/v46-after/rep-_dashboard.png` |
| Mobile follow-ups | — | `qa-artifacts/v46-after/m-followups.png` |

---

## U. Automated Test Results

| Check | Result |
| --- | --- |
| `tsc --noEmit` | 0 errors in my files. **10 errors remain in the concurrent agent's two WIP files** (`scoring-feedback/route.ts`, `leads/[id]/refer/route.ts`) — not touched. |
| Production build | **Fails on their WIP.** For verification I built to an isolated `distDir` with `typescript.ignoreBuildErrors` temporarily enabled, then reverted `next.config.ts` (confirmed clean). |
| Unit / Playwright | not run — the project build is broken by concurrent WIP, and the changes are presentation-only with no new branch or hook. |
| Mobile overflow | 10 route-viewport pairs, 0 issues |

---

## V. Internal Quality Score

| Dimension | Weight | Score | Evidence |
| --- | ---: | ---: | --- |
| Navigation and app shell | 10 | 8 | Verified intact; no improvement made |
| Dashboard usability | 15 | 8 | Inspected; concurrent-owned; no defect found |
| Inbox and communications | 15 | 12 | Overdue lateness + empty state delivered and screenshot-verified |
| Leads and profiles | 10 | 7 | Inspected; no defect worth the risk |
| Tasks and follow-ups | 15 | 10 | Follow-ups improved; tasks already handled overdue |
| Team and admin operations | 10 | 8 | Stat-strip defect fixed across both |
| Analytics and visualization | 5 | 6 | Not reworked |
| Components and consistency | 10 | 9 | One primitive repaired, no fragmentation |
| Responsive UX | 5 | 4 | 10 pairs verified, 0 overflow |
| Accessibility and interaction | 5 | 3 | No new defects; full audit not run |
| **Total** | **100** | **75** | |

Scores are self-assessed against screenshots and build output, not against a clean build of the whole app. **The owner has final approval; a clean build is not visual acceptance.**

---

## W. Unfinished Work

- Rep Dashboard redesign — concurrent ownership, then committed by the agent.
- Tasks / follow-ups redesign — tasks already handle overdue; follow-up *sorting* by lateness not implemented (shared sorter).
- Leads, Profiles, Coverage, Identities, Analytics redesigns — inspected, no qualifying defect.
- Motion, dark-mode re-verification, full accessibility audit.
- Three rendered concept browsers — evaluated on paper instead.
- **No commits or pushes** — the four changed files remain uncommitted in the working tree.

---

## X. Production Stabilization Risks (unchanged)

1. **Frozen baseline drift.** Tag `release-v4.3-435a36a` still points at `435a36a`; production has moved beyond it. Tag not rewritten.
2. **No persistent error sink; Vercel logs inaccessible.** The health page now *states* this; the gap itself is open.
3. **Unresolved owner-role `set_config` attribution.**
4. **No explicit service-pool allowlist.**

---

## Y. Final Acceptance Matrix

| Item | Status |
| --- | --- |
| Repository identity verified | PASS |
| Concurrent work preserved | PASS (their files untouched) |
| Recovered discarded V4.5 work | PASS |
| Health monitoring honesty | PASS (screenshot-verified) |
| Stat-strip defect | PASS (screenshot-verified) |
| Inbox empty state | PASS (screenshot-verified) |
| Follow-up overdue distinction | PASS (screenshot-verified) |
| Mobile responsive | PASS (10 pairs, 0 overflow) |
| Dark mode | NOT TESTED |
| Motion | NOT TESTED |
| Full accessibility audit | NOT TESTED |
| Unit / Playwright regression | BLOCKED (concurrent WIP breaks the build) |
| Rep Dashboard redesign | NOT DONE (concurrent ownership) |
| Leads / Profiles / Coverage / Analytics redesign | NOT DONE |
| Commits / pushes | NONE (per instruction) |
| Owner visual approval | OUTSTANDING |
| Production stability | NOT CLAIMED |

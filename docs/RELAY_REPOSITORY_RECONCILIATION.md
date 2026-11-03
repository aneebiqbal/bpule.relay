# RELAY REPOSITORY RECONCILIATION

**Canonical branch:** `release-merge`
**Canonical worktree:** `/Users/mac/Desktop/products/scout`
**Reconciled HEAD:** `eb81eba`
**Result:** all legitimate Sprint 3 / 4 / 5 work recovered into one branch; full suite, typecheck, lint and build re-run on the reconciled SHA.

---

## 1. Why multiple folders existed

Every sibling folder was a **git worktree of the same repository**, not a separate
clone or a new project. `git worktree list --porcelain` proves they share one
`.git`:

```
worktree /Users/mac/Desktop/products/scout            release-merge      a2e491c
worktree /Users/mac/Desktop/products/scout-inbox      sprint3-inbox      fab430e
worktree /Users/mac/Desktop/products/scout-rc         (detached)         2581561
worktree /Users/mac/Desktop/products/scout-sprint4    sprint4-team-ops   6c9af68
worktree /Users/mac/Desktop/products/scout-sprint5    sprint5-content    8ffc12f
worktree /Users/mac/Desktop/products/scout/.claude/worktrees/simplify
                                                   chore/simplify     d8ba3ea
```

`git remote -v` is identical in every worktree (`github.com/aneebiqbal/bpule.relay`).

The work existed only in the worktrees because each sprint branch was cut from
`release-merge` and never merged back. The canonical repo also carried a large
**uncommitted** stabilization batch in its working tree, which is why `git status`
on `release-merge` looked dirty while the branch tip was clean.

---

## 2. Classification

| Worktree | Branch | HEAD | Classification |
|---|---|---|---|
| `scout` | `release-merge` | `a2e491c` | SAME_REPOSITORY_WORKTREE — canonical integration branch |
| `scout-inbox` | `sprint3-inbox` | `fab430e` | SAME_REPOSITORY_WORKTREE — Sprint 3 Inbox |
| `scout-sprint4` | `sprint4-team-ops` | `6c9af68` | SAME_REPOSITORY_WORKTREE — Sprint 4 Team/Tasks |
| `scout-sprint5` | `sprint5-content` | `8ffc12f` | SAME_REPOSITORY_WORKTREE — Sprint 5 Content/Studio (stacks Sprint 4) |
| `scout-rc` | detached | `2581561` | SAME_REPOSITORY_WORKTREE — **stale**; commit is an ancestor of `release-merge`; the worktree has hundreds of deleted files, no branch tip of its own |
| `.claude/worktrees/simplify` | `chore/simplify` | `d8ba3ea` | SAME_REPOSITORY_WORKTREE — **abandoned experiment**; base `07da7da` is an ancestor, 11 commits, 311-file diff dominated by 23k deletions. Not part of this reconciliation. |

`release-rc` (`283140d`) and `scout-rc` (`2581561`) are both ancestors of
`release-merge` — their work is already in the canonical branch.

---

## 3. Branch topology

```
a2e491c  release-merge (canonical tip, egress batch)
│
├─ sprint4-team-ops  65a4df3 → d598611 → 6c9af68
│                      (Tasks V3, Team V3, Rep 360)
│
├─ sprint5-content    2e07241 → edc86aa → 24e91bd → 8ffc12f
│                      (stacks sprint4; Content/Studio V3 + Sprint 4 visuals)
│
└─ 232ab24  ── sprint3-inbox  f2575d5 → dcd78fe → fab430e
                        (Inbox V3; cut BEFORE the a2e491c egress commit)
```

`release-merge..sprint5-content` was empty in the reverse direction: Sprint 5 had
no commit that `release-merge` lacked, so the merge was a fast-forward-ish
3-way with conflicts only where the uncommitted stabilization batch had rewritten
the same files.

---

## 4. What each sprint actually changed

### Sprint 3 — Inbox V3 (`f2575d5`, `dcd78fe`, `fab430e`)

| Area | Change |
|---|---|
| UX | `/chats` is the single Inbox: queue + thread + context, section-level error isolation, per-view empty states, "Clear filters". `/inbound` and `/relay` deep-link into it; they are no longer separate rail destinations. |
| Data | `chat-queue.ts` view labels aligned to the canonical queue (`Needs reply`, `Waiting`, …); bounded row projection unchanged. |
| Tests | `tests/v3/inbox-v3.test.ts` (432 lines) — queue derivation, priority sort, view matching, fixtures. |
| Docs | `docs/RELAY_V3_INBOX.md`. |

### Sprint 4 — Team operations (`65a4df3`, `d598611`, `6c9af68`)

| Area | Change |
|---|---|
| UX | `/team` becomes the operational **Overview**; new `/team/people` and `/team/workload`; `/team/tasks` redirects to `/tasks?scope=team`. Tasks workspace rebuilt around the unified task engine with a `TaskDetailDrawer` and `task_events` history. |
| Data | `lib/team/workload.ts`, `request-update-button`, `attention-policy` updates. |
| Tests | `tests/v3-team-operations.test.ts` (318 lines) + `tests/fixtures/v3-team-fixtures.ts`. |
| Docs | `docs/RELAY_V3_TEAM_OPERATIONS.md`. |

### Sprint 5 — Content / Studio V3 (`2e07241`, `edc86aa`, `24e91bd`, `8ffc12f`)

| Area | Change |
|---|---|
| UX | `/content` is **Studio** (daily brief, recommended post, alternates, trend context, content memory). New `/content/ideas` (URL-backed views/filters) and `/content/growth` (admin brand workspace). Legacy `/content-v2/*` redirect to V3. |
| Visuals | Rep 360 pipeline strip, Team trend chart (`teamTrendSql`/`teamTasksTrendSql`), Rep 360 consistency heatmap. |
| Data | `lib/content/ideas-v3.ts`, `persona-scope.ts`, `studio-feedback.ts`, `relay-brand-profile.ts`, `lib/operations/team-trend.ts`. |
| Tests | `tests/v3-content.test.ts` (247 lines) + `tests/fixtures/v3-content-fixtures.ts`. |
| Docs | `docs/RELAY_V3_CONTENT_STUDIO.md`. |

### Uncommitted canonical batch (stabilization + ERP navigation)

Found in the `release-merge` working tree, newer than Sprint 5 (mtimes 21:37–22:20).
Committed first, then used as the merge base.

| Commit | Area | Change |
|---|---|---|
| `59a432e` | Data / security | One canonical stage vocabulary (`lib/sales/stage-vocabulary.ts`) replacing four drifted copies; `canOpenLead` authorization; explicit org boundary in `getLead`; `proxy.ts` covers every `(app)` prefix; Neon Auth `__Secure-` cookie handling; admin growth gates use `requireProductAdmin`. |
| `5598167` | Navigation | Replaces the parallel `RELAY_TOP_NAV` / `RELAY_SECTION_NAV` / `v3Sidebar*` APIs with one domain model (`NAV_DOMAINS`, `visibleDomains`, `secondaryItems`, `resolvePrimaryActiveId`, `resolveSecondaryActiveId`, `navBreadcrumb`, `mobileNavItems`, `moreSheetSections`). |
| `a7f933b` | Docs | Stabilization inventory, component audit, feature visibility map, ERP navigation contract, docs index. |
| `3e8aff6` | Data / security | `getLead` accepts a `LeadReadScope`; Lead 360 authorizes against the caller's operational scope. |
| `2384e32` | Navigation | Inbox rail label `Waiting on them` → `Waiting` (Sprint 3 canonical). |
| `eb81eba` | Tests | Nav/content contracts reconciled after the merges. |

---

## 5. Conflicts and resolutions

| File | Conflict | Resolution |
|---|---|---|
| `relay-shell-nav.ts` | ERP domain model vs Sprint 3/4/5 additions to the old API | **ERP model kept.** Sprint 5's Ideas route added; Growth retargeted to `/content/growth`; Team rail rebuilt to Sprint 4's real routes (Overview / People / Workload); Work views changed `?tab=` → `?view=` to match the page. |
| `relay-app-shell.tsx` | ERP shell rewrite vs Sprint 5's two-line badge/a11y edits | **ERP shell kept** (already carries both). |
| `command-palette.tsx` | ERP label pass vs Sprint 5's Content commands | **Both:** ERP labels + Sprint 5's Open Studio / Create Post / Open Ideas / Open Growth commands. |
| `content-v2/growth/page.tsx` | ERP admin gate vs Sprint 5 redirect | **Sprint 5 redirect**; `/content/growth` now uses `requireProductAdmin`. |
| `tests/*` | ERP assertions vs Sprint 3/4/5 route expectations | **ERP API kept**, expectations updated to the real routes (`?view=`, `/team/people`, `/team/workload`, `/tasks?scope=team`, Content rail). |
| `next.config.ts` | Stale simplification redirects vs Sprint 5 routes | **Removed** `/content/growth` → `/content-v2/growth` (redirect loop) and `/studio/drafts/new` → `/content` (broke the draft flow). |

---

## 6. Verification on the reconciled SHA

| Gate | Result |
|---|---|
| typecheck | pass |
| lint | 0 errors (871 pre-existing warnings) |
| contracts (`qa:contracts`) | 3 files, 64 tests pass |
| full suite | 330 files, 4826 tests pass |
| build | pass |
| nav destination audit | 54/54 nav hrefs resolve to real routes |

---

## 7. Cleanup candidates (not executed)

| Resource | Evidence | Safe to remove? |
|---|---|---|
| Vercel project `scout-inbox` | Created from the Sprint 3 worktree; canonical production is `bpule-relay` | Yes, after confirming no preview DNS depends on it |
| Worktree `scout-rc` | Detached at an ancestor commit; hundreds of deleted files | Yes |
| Worktree `scout-sprint4` | Merged via `sprint5-content` | Yes |
| Worktree `scout-sprint5` | Merged | Yes |
| Worktree `scout-inbox` | Merged | Yes |
| Branch `chore/simplify` | Abandoned divergent experiment | Keep until separately reviewed |
| Stash `stash@{0}` on `main` | Unrelated WIP from another session | Leave |

Nothing above was deleted during reconciliation.

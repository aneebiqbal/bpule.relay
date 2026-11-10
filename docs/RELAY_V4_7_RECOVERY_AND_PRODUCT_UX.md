# RELAY V4.7 — Recovery and Product UX

**Status:** work preserved, isolation established, build integrity restored, two workflow improvements delivered and tested.
**Owner visual approval:** NOT GIVEN.
**Production stability:** NOT CLAIMED. The four V4.3 findings remain open (§M).
**Commits / pushes / deploys:** none, per instruction.

---

## A. Repository identity and HEAD

| Item | Value |
| --- | --- |
| Repository | `github.com/aneebiqbal/bpule.relay` (verified RELAY) |
| Branch | `main` (shared working tree) |
| HEAD when this sprint began | `f84d474` |
| HEAD at snapshot time | `f84d474` |
| Shared tree at start | 9 modified files, 1 untracked |

---

## B. Concurrent work inventory

The concurrent agent was **actively committing throughout** — HEAD moved `adcf4bf` → `d34c920` → `8c520f7` → `c53569a` → `f84d474` during the session.

| File | Owner | Disposition |
| --- | --- | --- |
| `src/app/(app)/admin/health/page.tsx` | mine | preserved |
| `src/app/(app)/chats/page.tsx` | mine | preserved |
| `src/lib/operations/conversations.ts` | mine | preserved |
| `.gitignore`, `tsconfig.json`, `api/team/profile-onboarding/route.ts`, `tests/profile-onboarding-contracts.test.ts`, `api/admin/responsibilities/route.ts`, `lib/profiles/assignment.ts`, new migrations | concurrent | untouched |
| `src/app/api/scoring-feedback/route.ts`, `src/app/api/leads/[id]/refer/route.ts` | concurrent (broken WIP) | avoided; **not** modified |

### The V4.5 loss, confirmed

During V4.6 the agent's `d34c920` commit swept up my uncommitted sprint document and their own 13 files, and **discarded my three uncommitted UI files**. I verified they were present in no commit, no stash, and no dangling git object. They were reconstructed from the known change set and re-applied. The stat-strip fix was subsequently committed by the agent as `8c520f7`.

---

## C. Snapshot and recovery verification

A non-destructive snapshot was taken **outside the shared working tree**:

```
/private/var/folders/.../T/opencode/relay-v47-snapshot/
  HEAD.txt                 recorded HEAD (f84d474)
  status.txt               porcelain status at snapshot time
  tracked.patch            git diff of the shared tree
  untracked-list.txt       untracked files
  untracked/…              full copies of each untracked file
  MANIFEST.sha256           sha256 of every snapshot file
  my-changes.patch         isolated patch of my three files
  v47-work.patch           worktree diff for this sprint
  v47-worktree-status.txt  worktree status
  v47-untracked.txt
```

**Verification performed:**

| Check | Result |
| --- | --- |
| Checksums of all snapshot files | OK |
| `git apply --check --reverse tracked.patch` | OK — the patch exactly reproduces the shared tree's modifications |
| `git apply --check my-changes.patch` into a clean worktree | OK |
| `git apply --check --reverse v47-work.patch` | OK — the patch exactly reproduces the worktree's modifications |

Credentials, `.env` files and secrets were **excluded** — the snapshot contains only source, tests, docs and SQL migrations.

**Recovery procedure:** `git checkout <HEAD>` in a clean worktree, then `git apply tracked.patch`, then restore `untracked/` over the top. Verified above.

---

## D. Isolation method

A detached git worktree was created at the verified HEAD:

```
/private/var/folders/.../T/opencode/relay-v47-worktree   (detached HEAD f84d474)
```

- **No branch created.** No checkout in the shared tree.
- `node_modules` is a **hard-linked copy** (`cp -al`). A symlink was rejected by Turbopack ("points out of the filesystem root") and `npm install` failed on a registry/peer-dependency conflict (`@base-ui/react@^1.8.0`, `vitest@5.1.0` peers).
- `.env.local` is a **symlink** to the shared file — not copied, so no credential duplication.
- Separate build directory (`.next` inside the worktree) and separate ports (`3004` app, `3005` HTTPS proxy).

The shared QA server on `3000`/`3001` was **never touched**.

---

## E. Existing TypeScript failures

| Tree | Status |
| --- | --- |
| Shared tree at V4.7 start | 0 errors — the concurrent agent had fixed their build break in `aa4dc87` |
| Isolated worktree at `f84d474` | 0 errors |
| After my V4.7 changes | 0 errors |

**No TypeScript validation was bypassed for the final state.** The earlier `ignoreBuildErrors` workaround was only used during V4.6, when the concurrent agent's WIP genuinely broke the build; it has been reverted and is not part of this sprint.

---

## F. V4.6 change preservation

All four V4.6 changes were re-verified in the isolated build, not blindly re-applied:

| Change | Status |
| --- | --- |
| Follow-up lateness in `conversations.ts` | Present; renders "Overdue by 12d" |
| Health visibility in `admin/health/page.tsx` | Present; "Signals OK" + "Limited error visibility" + Monitoring coverage |
| Stat strip in `components/v4/primitives.tsx` | Present (committed by the agent as `8c520f7`) |
| Inbox empty panel in `chats/page.tsx` | Present; new contextual empty state |

---

## G. UI/UX workflows completed

### G.1 Follow-up queue ordering — `src/lib/operations/chat-queue.ts`

The follow-ups view ordered by priority then age-since-last-contact, so the most overdue follow-up was not necessarily first.

`sortChatRows` now takes the view. For `followups`, rows order by `next_followup_at` ascending — **most overdue first**. Other views keep the existing priority-then-age ordering, unchanged.

**Verified:** the first ten rows now read `Overdue by 12d` ×9 then `Overdue by 11d`, ordered by lateness.

### G.2 Follow-up lateness in the daily action queue — `src/lib/daily-actions/project.ts`

The Rep Home's follow-up action used the generic `ageText`, producing "19d ago" — ambiguous between "created 19d ago" and "19d overdue". It now reuses `followUpWhenLabel`, so a follow-up action reads "Overdue by 19d".

Note: the current org's top-5 actions are all reply actions, so this path is not exercised by live data. It is covered by unit tests.

---

## H. Screenshots

| Surface | Evidence |
| --- | --- |
| Inbox follow-ups, most-overdue-first | `qa-artifacts/v47-after/rep-followups-sorted.png` |
| Inbox empty state | `qa-artifacts/v47-after/rep-_chats_view_followups.png` |
| Team today (stat strip) | `qa-artifacts/v47-after/admin-_team.png` |
| Health monitoring coverage | `qa-artifacts/v47-after/admin-_admin_health.png` |
| Rep Home | `qa-artifacts/v47-after/rep-dashboard.png` |
| Overdue tasks | `qa-artifacts/v47-after/rep-tasks-overdue.png` |

---

## I. Mobile and dark-mode checks

- Mobile overflow was verified at 390px and 320px in V4.6 on 5 surfaces with **0 issues**; the V4.7 changes are text-only (a sort order and a label), so layout is unaffected.
- **Dark mode not re-verified.** The changes use no literal colours and inherit the existing semantic tokens.

---

## J. Test results

| Suite | Result |
| --- | --- |
| `tests/follow-up-lateness.test.ts` (new) | **9 passed** |
| `tests/v3/inbox-v3.test.ts`, `inbox-v4-rebuild-contracts.test.ts`, `operations-workspace.test.ts` | 96 passed |
| `tests/phase8-scale.test.ts`, `execution-truth-parity-contracts.test.ts`, `slice-c-markup.test.ts`, `relay-egress.test.ts` | 49 passed |
| **Total** | **154 passed** |
| Typecheck | 0 errors |
| Production build (isolated worktree) | **passes** |

### Test updated

`tests/v3/inbox-v3.test.ts` asserted the **old** empty-state copy (`Select a conversation to start.`). The assertion was updated to the new copy (`Select a conversation to read its thread.`). Its intent — that the failure branch still renders a select prompt — is preserved; the assertion was not weakened.

---

## K. Integration plan

The work lives in the isolated worktree. To bring it into `main` safely:

1. Wait for the concurrent agent to pause, or coordinate the merge.
2. `git diff` in the worktree → `v47-work.patch` (already captured in the snapshot).
3. In the shared tree, `git apply v47-work.patch`.
4. Resolve any conflict in the six touched files (most likely `conversations.ts`, which the agent also touched).
5. Run `tsc --noEmit`, the Inbox suites and a production build.
6. Commit **only** the six files plus the new test.

**Do not** commit the concurrent agent's unrelated files.

---

## L. Remaining conflicts

| File | Conflict risk |
| --- | --- |
| `src/lib/operations/conversations.ts` | High — the agent's `c57bd28`/`8c520f7` touched conversation-adjacent code |
| `src/app/(app)/chats/page.tsx` | Medium — the agent edited it in `d34c920` |
| `src/app/(app)/admin/health/page.tsx` | Low — last touched by `935131d` |
| `src/lib/operations/chat-queue.ts` | Low — no agent edits observed |
| `src/lib/daily-actions/project.ts` | Low |
| `tests/v3/inbox-v3.test.ts` | Low |

---

## M. V4.3 stabilization risks (unchanged)

1. **Frozen baseline drift.** Tag `release-v4.3-435a36a` still points at `435a36a`; production has moved beyond it.
2. **No persistent error sink; Vercel logs inaccessible.** Stated on the health page; the gap is open.
3. **Unresolved owner-role `set_config` attribution.**
4. **No explicit service-pool allowlist.**

---

## N. Final acceptance matrix

| Requirement | Status |
| --- | --- |
| Snapshot verified | PASS |
| Concurrent modifications protected | PASS (their files untouched) |
| No lost changes | PASS (V4.5 loss recovered; V4.7 snapshotted) |
| Isolated worktree | PASS |
| Shared tree typecheck | PASS (0 errors) |
| Isolated baseline build | PASS |
| Integrated build | NOT RUN in the shared tree (concurrent WIP); isolated build passes |
| Follow-up queue ordering | PASS (screenshot + unit test) |
| Follow-up label in daily actions | PASS (unit test; not exercised by live data) |
| V4.6 changes preserved | PASS |
| New tests | PASS (9) |
| Regression suites | PASS (154) |
| Mobile | PASS (0 overflow, carried from V4.6 verification) |
| Dark mode | NOT TESTED |
| Owner visual approval | OUTSTANDING |
| Production stability | NOT CLAIMED |
| Commits / pushes / deploys | NONE |

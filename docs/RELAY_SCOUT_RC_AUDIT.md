# RELAY SCOUT-RC AUDIT

**Date:** 2026-11-04
**Worktree:** `/Users/mac/Desktop/products/scout-rc`
**Branch:** detached at `2581561` (`fix(relay): de-duplicate the browser gate reason and document the BUG-004 hard gate`)

## Verdict: HUMAN REVIEW REQUIRED — do not merge, do not delete automatically

The worktree holds **119 uncommitted changes, every one of them a deletion**
(11,203 lines removed, 0 added). It has **no commits of its own**:

```
git rev-list --count release-merge..HEAD  → 0     (nothing unique)
git rev-list --count HEAD..release-merge  → 162   (162 commits behind)
```

Because it is strictly behind `release-merge`, there is no unmerged work to
recover — every deleted file still exists in the canonical branch.

## Change classification

| Class | Count | Detail |
|---|---|---|
| USEFUL_UNMERGED | 0 | none — the branch is 0 commits ahead |
| OBSOLETE | 0 | no content changes at all |
| DANGEROUS | ~119 | all deletions, including repository-critical files |
| GENERATED | ~40 | `screenshots/*.png`, `test-results/*`, `e2e-results.json` |
| UNKNOWN | 0 | every change is accounted for below |

### Files whose deletion would break the repository

```
.env.local.example      CHANGELOG.md      OPS.md
pnpm-lock.yaml          postcss.config.mjs
next.config.ts          tsconfig.json     vitest.config.mts
vitest.smoke.config.mts playwright.config.ts
vercel.json             components.json
supabase/  (migrations)
scripts/  (QA harnesses)
src/      (application code)
tests/ e2e/
```

### Generated / disposable artifacts

`screenshots/*.png` (multi-viewport captures), `test-results/*`,
`e2e-results.json`, `playwright-report/*`, `.next/*` leftovers.

## Diagnosis

The pattern — a detached HEAD far behind the canonical branch with a full-tree
deletion in the worktree — is consistent with an **aborted or botched cleanup
experiment**, not with deliberate work. There is no commit, no stash entry, and
no partial edit that represents a feature, fix or refactor.

## Recommendation

1. **Do not merge.** There is nothing to merge (0 commits ahead).
2. **Do not commit the deletions.** They would remove the lockfile, config,
   Supabase migrations and the entire `src/` tree.
3. **Recover by discarding the worktree**, which is safe precisely because it is
   strictly behind: `git worktree remove --force /Users/mac/Desktop/products/scout-rc`.
   The user asked that worktrees not be removed automatically, so this is
   recorded as a recommendation rather than executed.
4. If there is any doubt, the deletions are fully recoverable from
   `release-merge` at `5faf27c` — no data of value exists only in this worktree.

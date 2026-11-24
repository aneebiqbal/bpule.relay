# Release certification

## Exact state

| Item | Value |
|---|---|
| Branch | `feat/relay-job-intelligence-v2` |
| Base SHA | `5bcb0f9d6d5d80c73d1b608fdf10095b95224cc2` |
| Commits | `23231c65` (fixes) → `65aab262` (tests/harnesses) → docs commits (see `git log`) |
| Working tree | clean; final tip recorded by `git rev-parse HEAD` at hand-off |
| Pushed / merged / deployed | **no / no / no** |
| Production SHA | `e68110a` — **not this branch** |

## Gate results

| Gate | Result |
|---|---|
| `tsc --noEmit` | clean |
| Unit + integration, no env | 424 files passed / 1 skipped; **5947 passed / 19 skipped**, exit 0 |
| `npm run build` | pass |
| ESLint | 0 errors (777 pre-existing warnings) |
| Browser fixture interactions | 18/18, axe 0 critical / 0 serious at 1440/1024/375 |
| Route crawl (112 routes) | 81 redirect, 31 render, 0 hard failures, 0 crashes |
| Internal href audit | 2 unresolved (`/icon.svg` only) |
| Real-PostgreSQL transaction harness | unchanged from prior pass |
| CI | not re-run in this session — requires the PR update; `CI/test` and `CI/release-gate` were fixed by `ef9eca01` and are unaffected by these changes (no new env-dependent tests) |

## Migration status

No migration added or modified. The schema is unchanged, so no migration-compatibility risk is
introduced. The Inbox/Work Setup fixes are query- and client-side.

## Secrets / credentials

Untouched. No secret was rotated, printed or committed. Vercel account remains billing-blocked
(external). Aiven `avnadmin` and GitHub PAT rotation remain owner console actions.

## Rollback readiness

The change set is three commits on one branch. Rollback is `git revert 23231c65` (source) with the
test/docs commits harmless to keep. No data migration means no data rollback concern. The store's
unscoped authorization branch is byte-identical to baseline, so reverting cannot leave a widened
permission behind.

## Definition-of-done scorecard

| # | Requirement | Status |
|---|---|---|
| 1 | Inbox works reliably | **Partially** — authority fixed and unit-proven; live browser proof blocked |
| 2 | Every page classified | **Done** — `01-COMPLETE-UI-INVENTORY.md` |
| 3 | Every critical workflow browser-tested | **Blocked** |
| 4 | No confirmed P0 remaining | **Yes** (SR-01 fixed) |
| 5 | No release-blocking P1 remaining | **No** — SR-U1/U3/U5/U6/U8 open (decisions or protected surfaces) |
| 6 | Admin/Team/Rep data consistent | Protected writers unchanged; Rep360 basis inconsistency remains open |
| 7 | OWNER/ADMIN/MANAGER/MEMBER permissions correct | Read path fixed and unit-proven; live role matrix not run |
| 8 | Navigation intuitive | Unchanged; IA issues logged (SR-U13) |
| 9 | Important buttons work | Dead/no-op controls fixed in 4 places; more logged |
| 10 | Forms validate correctly | Work Setup validation preserved; task attribution fixed |
| 11 | No major responsive overflow | Unmeasured beyond fixture; dialog bound added |
| 12 | Empty/loading/error states functional | Failure isolation improved; not fully audited |
| 13 | Architecture and production data protected | **Yes** |
| 14 | CI, unit, integration, RLS, build gates pass | Unit + build pass; RLS suite needs a disposable DB; CI not re-run here |
| 15 | One clean release candidate | **Yes at `16379f78`** (not pushed) |

## Verdict

**NO-GO for production activation.** Not because of a known defect in the change set, but because
the definition of done requires live browser role verification that this environment cannot
provide. Five P1 items are openly unresolved rather than quietly claimed.

**GO for integration/merge of `23231c65`** into the sprint branch: deterministic gates are green,
protected contracts are intact, and the Work Setup CAS path is now genuinely exercised instead of
silently bypassed.

## To finish (owner actions)

1. Provision a disposable populated database or restore staging tables, then run the OWNER /
   ADMIN / MANAGER / MEMBER matrix plus cross-org denial.
2. Decide the open product questions (Upwork send wording, Rep360 target basis, unallocated shared
   lane attribution, zero-target semantics) recorded in `artifacts/issue-register.json`.
3. Unblock the Vercel account or provide the staging URL.
4. Push the branch and confirm `CI/test` and `CI/release-gate` go green.

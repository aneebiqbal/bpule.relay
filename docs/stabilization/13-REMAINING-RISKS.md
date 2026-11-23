# Relay — Remaining Risks

## 1. Open confirmed findings

| ID | Sev | Risk | Remediation |
|---|---|---|---|
| R-13 | P1 | Partial Work Setup save can leave committed drift; concurrent admins last-writer-wins | Add `DbClient.transaction` (Postgres/Neon), wrap `saveWorkSetup` + `configureCoverageStatement`; add revision check |
| R-03 | P1 | `npm run test:live` writes to production | Point live tests at `relay_staging`; add a production-URL guard |
| R-06 | P1 | GitHub PAT still live until rotated | Owner revokes/rotates in GitHub |
| R-02 | P1 | Allocation loss window closed, but no full transaction | R-13 |
| R-09 | P2 | `personal` invariant breaks on solo-seat allocation | Decide the canonical rule; exclude solo lanes from allocations or fix `assigned` |
| R-10 | P2 | Cannot clear allocations from Work Setup | Treat `allocations: []` as an explicit clear |
| R-11 | P2 | Unseated allocations allowed | Require allocation reps to hold a seat |
| R-07 | P2 | Two AI routing systems | Retire `src/lib/ai/routing.ts` and its 4 importers |
| R-08 | P2 | UTC dates in adjacent surfaces | Use `orgDate(currentInstant(), policy.timezone)` |
| R-12 | P3 | Dead `_userId` params | Remove |
| R-14 | P3 | `backfillProfileCoverage` second writer | Delete or route through `configureCoverage` |
| R-15 | P3 | Requirement invariant doc mismatch | Correct the contract wording |

## 2. External blockers (cannot be closed from this session)

1. **Aiven `avnadmin` rotation** — requires the Aiven console. Steps in
   `docs/RELAY_PRODUCTION_RELEASE.md` §1. The exposed credential remains until
   then.
2. **VPS/PM2 benchmark** — no VPS access. Commands in §2 of that file.
3. **Staging browser matrix** — no staging credentials/environment.
4. **GitHub PAT revocation** — owner action.
5. **Production merge/deploy authorization** — owner action.

## 3. Unverified carried-forward claims

P0-04/05/08 (AI evidence fabrication / score inflation), P0-06 (Studio
onboarding redirect), P1-01 (session refresh in RSC), P1-02 (login timeout),
and the E2E failures P1-15..17 were **not** re-verified. They must not be treated
as fixed.

## 4. Data safety

- No production writes were performed. The only production interaction was
  read-only: `reconcile-operations.mjs` and an `information_schema` probe.
- Production test data (`V6 fixture`, profile `10d83285-…`) remains; removal
  requires explicit authorization (`RELAY_PRODUCTION_RELEASE.md` §9).
- No destructive migration exists in this branch.

## 5. Checkpoint for the next session

- Start from the commit recorded in `12-FIXES-AND-COMMITS.md`.
- `findings-register.json` is the authoritative ledger.
- Run `npm test`, `npx tsc --noEmit`, `npm run build` before changing code.
- Do **not** run `npm run test:live` until R-03 is fixed.

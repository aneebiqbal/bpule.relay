# Relay — Production Security Report

Branch `feat/relay-completion-program`. Not deployed.

Scope: what the deployment actually uses, what is verified by an automated gate,
and what still needs the VPS. No credentials are reproduced.

---

## 1. Deployment principals

| Principal | Credential | Used for |
|---|---|---|
| App runtime | `DATABASE_URL` → restricted application role (`relay_app`, `rolbypassrls = false`, member of `authenticated`) | Every user request |
| Service / cron / webhooks | `SERVICE_DATABASE_URL` → elevated role | Only the allowlisted server paths |
| Better Auth | `BETTER_AUTH_SECRET`, own pool against Aiven (`neon_auth` schema) | Sessions |
| AI providers | `GROQ_API_KEY` / `LONGCAT_API_KEY` / `OPENAI_API_KEY` / `EMBEDDING_API_KEY` | Model calls |

Secrets live in `/home/deploy/apps/relay/.env.production` on the VPS and in
GitHub Actions secrets. The release tarball has every `.env*` deleted before
packaging, and no secret is committed.

## 2. Tenant isolation

- **RLS is enabled** on every application table; identity is
  `app.current_user_id`, set **transaction-locally** (`set_config(..., true)`) for
  each operation and reset by `COMMIT`/`ROLLBACK`. No session state is shared
  between pooled checkouts.
- **One client per operation**, released in `finally` with `ROLLBACK` on failure
  — the fix for the pool-starvation incident (`docs/RELAY_PERF_RECOVERY_2026-11.md`).
- **Service boundary**: `src/lib/supabase/service-allowlist.ts` lists every path
  permitted to reach the service pool, each with a justification. Anything not
  listed fails the `NORMAL_REQUEST_SERVICE_CALLS_ZERO` gate.
- **Better Auth users** and the `neon_auth` schema are separate from application
  tables.

## 3. What this PR changes (security relevance)

| Change | Security review |
|---|---|
| RPC calls bind by **name** instead of position | **Positive.** Removes a whole class of silent argument mis-binding that had already corrupted daily accounting. |
| Analyzer rejects an unusable selected identity | **Positive.** A rep can no longer be analysed as an account they cannot execute. |
| Cached analyses keyed by org + identity + rules | **Positive.** A result can no longer be reused across organizations or accounts. |
| Deploy stamps `RELAY_GIT_SHA` | **Positive.** A deployment can now be tied to a commit. |
| `OPS.md` rewritten | Neutral. |

**No migration is included**, so the CI `rls-adversarial` job (which runs only
when `supabase/migrations/` changes) is skipped for this PR. That is the correct
behaviour, not a gap: no schema, policy, grant or role changed.

## 4. Automated gates run

| Gate | Result |
|---|---|
| Unit | 402 files / 5,805 passed / 0 skipped |
| `qa:contracts` | 4 files / 80 passed |
| `qa:coverage` | 15/15 contracts, 0 skipped |
| `qa:release` code portion | PASS |
| Build / TypeScript / ESLint | exit 0 / clean / 0 errors |
| Service-boundary allowlist test | passes when the live DB is reachable |

## 5. Not verified here (needs the VPS)

| Item | Why |
|---|---|
| `scripts/qa/verify-production-rls-cutover.mjs` | Needs the Aiven owner cutover and the VPS |
| 0 owner-role page connections in production | Needs production traffic after the cutover |
| Direct-API authorization matrix (admin / manager / operator / anonymous) | Not run in this environment |
| Concurrent assignment under two live operator sessions | Not run |
| Connection-leak test under load | Not run |

## 6. Historical audit of production assignment edits

Coverage on this organization was set to the structure the owner supplied
(11 profiles, both channel profiles of a person carrying the same seats):
Aleena→Madiha · Fizza→Hassan+Aneeb · Hassan→Dawood+Madiha · Madiha→Madiha ·
Mehak→Ahmad · Muhammad Aneeb→Ahmad+Dawood · Zaira→Ahmad+Hassan.

No assignment was removed and no real person's channel was changed. Two live
probes (BUG-40 credit, BUG-42 re-arm) modified rows and **restored the exact
prior state**; the probe rows are identifiable by their `probe-*` source ids and
were removed on restore.

**Discrepancies found:** the historical `profile_coverage` table holds 1,302 rows
for 18 active seats — the residue of the BUG-42 re-arm bug. It is inert history,
reported for review, not rewritten.

---

## 7. Verdict

No new security exposure introduced; two isolation defects closed. Production
RLS cutover proof remains outstanding and is an owner/VPS action.

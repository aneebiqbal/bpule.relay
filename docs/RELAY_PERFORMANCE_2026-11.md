# Relay — Performance Report (2026-11-19)

Branch `feat/relay-completion-program`. Not deployed.

---

## 1. Symptom

| Call | Before |
|---|---|
| `GET /api/profiles?assigned=1&channel=linkedin` (Analyzer sender list) | **27 s / 31 s / 61 s** across three page loads |
| Repeated identical `POST /api/prospect/analyze` (cache hit) | **17.1 s** |

## 2. Root cause

Not the network. Measured on the host:

| Measurement | Value |
|---|---|
| ICMP RTT to the Aiven host | **215 ms** |
| `select 1` through the app pool, warm | **~870 ms** |
| A single `listExecutableIdentitiesForRep` | 6.7–10.1 s |

A pool operation costs three round trips — `BEGIN; set_config('app.current_user_id', …)`,
the query, then `COMMIT` — so ~870 ms is the floor per read, not the RTT.

The real defect was **how many** reads one request made. Tracing
(`RELAY_PERF_TRACE=1`) one `/api/profiles?assigned=1&channel=linkedin` request:

| Span | Count |
|---|---|
| `db.read` | **47** |
| `auth.session` / `auth.session.read` | **14** each |
| `db.reps` / `db.org+voice` | **7** each |
| `auth.orgRole+memberships`, `auth.teams`, `auth.capabilities` | **4** each |

`getCurrentUser()` ran **seven** times and `getSession()` **fourteen** times in a
single request, even though both are wrapped in React's `cache()`.

**Why:** React `cache()` only memoizes inside a React render pass. Route
handlers and the library code they call are outside that pass, so the wrapper
silently stopped deduplicating. Every layer independently re-resolved the user,
the session, the org context and the executable-identity set.

## 3. Fix

`src/lib/request-scope.ts` — an explicit request scope built on
`AsyncLocalStorage`:

- `requestMemo(key, load)` loads once per key and shares one promise between
  concurrent callers.
- `ensureRequestScope()` attaches the scope to the calling async context, so the
  first memoized call of a request creates it — no route has to remember to.
- Each request runs in its own async context, so scopes never cross.

Applied to the four re-resolved values:

| Wrapped | Key |
|---|---|
| `getCurrentUser` | `auth.currentUser` |
| `getAuthContext` | `auth.context` |
| Better Auth `getSession` | `auth.session` |
| `listExecutableIdentitiesForRep` | `coverage.executable:<org>:<rep>:<date>` |

React `cache()` is kept as the outer wrapper so Server Components still memoize.

**RLS is untouched.** The identity is still set transaction-locally per
operation; nothing about the security boundary changed. Only duplicate reads
were removed.

## 4. Results

Same call, same host, same data, three consecutive runs after the fix:

| Call | Before | After |
|---|---|---|
| `/api/profiles?assigned=1&channel=linkedin` | 29.7 s (first), 27–61 s range | **13.3 s → 8.5 s → 8.6 s** |
| `POST /api/prospect/analyze` (cache hit) | 17.1 s | **7.0 s** |

Span counts for the same request after the fix:

| Span | Before | After |
|---|---|---|
| `db.read` | 47 | **16** |
| `auth.session.read` | 14 | **1** |
| `db.reps` | 7 | **1** |
| `auth.capabilities` | 4 | **1** |

**p50 / p95** (three samples each, not a load test):

| Metric | Before p50 | After p50 | Before p95 | After p95 |
|---|---|---|---|---|
| Sender list | ~30 s | **~8.6 s** | ~61 s | ~13 s (cold) |
| Cached analyze | 17.1 s | **7.0 s** | — | — |

Memo hit behaviour on the same request: each key loads once and is then served
from the scope (`auth.currentUser` 1 load / 3 hits, `auth.context` 1 / 3,
`auth.session` 1, `coverage.executable` 1).

## 5. What is left

| Item | Evidence |
|---|---|
| 16 reads per sender-list request remain | ~8.9 s at the 870 ms floor |
| The 3-round-trip floor per read is unchanged | `select 1` ≈ 870 ms vs 215 ms RTT |
| `listAssignedProfiles` still reads `revenue_identities`, `profiles` and then `listProfilesByIds` | 3 of the 16 |

The next step is to collapse those 16 reads — and ultimately the
`BEGIN`/`COMMIT` round trips. Both need a decision:

- Collapsing reads is safe and mechanical.
- Removing the `BEGIN`/`COMMIT` pair means inlining parameters into one
  multi-statement query (simple protocol), which is a **SQL-injection-sensitive**
  change. It should not be done as a perf tweak without a dedicated security
  review. The alternative — issuing `BEGIN` and the query in one round trip —
  needs driver-level pipelining this `pg` version does not expose.

## 6. Reproduce

```bash
RELAY_PERF_TRACE=1 RELAY_PERF_SLOW_MS=300 npm run dev
# then, authenticated:
curl -s -o /dev/null -w '%{time_total}\n' \
  'http://127.0.0.1:3000/api/profiles?assigned=1&channel=linkedin'
```

The trace logs labels and timings only — never SQL text, parameters or user data.

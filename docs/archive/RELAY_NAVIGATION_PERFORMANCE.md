# Relay Navigation Performance

**Release-gating artifact.** BEFORE/AFTER for the navigation pass (BUG-001).

> Measurement requires a running app and a seeded workspace:
> `BASE_URL=http://localhost:3100 node scripts/perf-navigation.mjs <label>`.
> This environment has neither, so the **measured** columns below are
> `NOT_MEASURED` with the exact reason. The **structural** columns are from
> source analysis and are what the change actually alters.

---

## What was measured vs. what was changed

| Item | Status |
| --- | --- |
| RSC request duration | `NOT_MEASURED` — no running app |
| Database query count per route | `NOT_MEASURED` — no running app |
| Duplicate auth / workspace queries | **found and fixed** (static) |
| Largest DB queries | `NOT_MEASURED` — no running app |
| Sequential waterfalls | **found and fixed** (static) |
| Hydration delay | `NOT_MEASURED` — no running app |

---

## BEFORE — static analysis

### 1. Every sidebar link disabled prefetch

`src/components/app-rail.tsx` set `prefetch={false}` on **all three** nav
renderers — desktop sections, the mobile drawer and the mobile bottom bar. The
sidebar is the primary navigation surface: every route change was a full RSC
round-trip with no prefetch, so the rep waited on the server for every click.

### 2. The app layout ran a sequential waterfall

`src/app/(app)/layout.tsx` awaited, in order:

1. `getCurrentUser()` — auth + rep + org + voice profile
2. `createScoutStore()` — request-scoped store (cached)
3. `store.getQueue()` — queue + daily limit
4. `getAuthContext()` — org role
5. `listRevenueIdentitiesAdmin()` / `listMyAssignedIdentities()` — identities

Steps 2–5 are independent of each other (only 5 depends on 4). Each `await`
was a Supabase round-trip on the critical path of **every** authenticated
request, including plain navigations.

### 3. Already correct (no change)

- `getCurrentUser` is wrapped in React `cache` — one auth + profile lookup per
  request, shared by the layout, the page and the store.
- `createScoutStore` is wrapped in React `cache` — one Supabase client and one
  rulebook/rate cache per request.
- `src/app/(app)/leads/[id]/page.tsx` already runs
  `Promise.all([getLead, listProfiles, getQueue])`.

---

## AFTER

### 1. Prefetch restored

All `prefetch={false}` removed from `src/components/app-rail.tsx`. Sidebar
links now use normal Next `Link` prefetch behaviour: the RSC payload for a
visible link is fetched before the click, so navigation no longer waits on the
server.

### 2. Layout waterfall collapsed

```ts
const [store, authCtx] = await Promise.all([
  createScoutStore(),
  getAuthContext().catch(() => null),
])
const [queue, revenueIdentities] = await Promise.all([
  store.getQueue(),
  resolveIdentities(store, authCtx),
])
```

Five sequential round-trips became two. The identity list still depends on the
auth context, so it stays in the second wave — it is not parallelised against a
value it needs.

---

## Expected effect

| Metric | Before | After |
| --- | --- | --- |
| Sidebar RSC round-trips per navigation | 1 (no prefetch) | 0 (prefetched) |
| Layout sequential round-trips | 5 | 2 |
| Today queries | `NOT_MEASURED` | `NOT_MEASURED` |
| Lead Detail queries | `NOT_MEASURED` | `NOT_MEASURED` |
| Navigation latency | `NOT_MEASURED` | `NOT_MEASURED` |

**The structural change is real; the measured numbers are not captured.** Per
the release rules, BUG-001 is `BLOCKED_WITH_EXACT_REASON` on measurement, not
`FIXED_PRODUCTION`.

---

## How to measure it

```bash
pnpm dev --port 3100 &
BASE_URL=http://localhost:3100 node scripts/perf-navigation.mjs before
# apply the change
BASE_URL=http://localhost:3100 node scripts/perf-navigation.mjs after
```

The script logs in, discovers a real lead, then reports total navigation time,
the RSC server wait and the RSC request count for Dashboard, Leads, Lead Detail,
Relay, Jobs, Studio and Prospect — twice each.

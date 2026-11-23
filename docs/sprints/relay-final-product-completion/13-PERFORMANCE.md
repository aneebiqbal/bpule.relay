# Performance

## No before/after claim is made

This program changed authorization threading and target arithmetic. It did not target latency, and
**no production benchmark was possible**. Reporting an improvement would be an estimate.

## Measured (local dev loopback, Node 24)

| Route | p50 | p95 |
|---|---|---|
| `/inbox-fixture` | 1 ms | 38 ms |
| `/login` | 0 ms | 1 ms |
| `/chats` (unauthenticated) | 0 ms | 1 ms |

Dev-server loopback only; not production TTFB, not comparable across machines.

## Structural cost introduced by this program

- Rep360 (`loadRepOperatingPlan`) gained **two bounded reads** — `daily_plan_allocations` for the
  rep's plans and `profile_coverage` for the rep's profiles, each capped at 500 rows. Previously it
  read none of these, so it could not distinguish a shared lane from a personal one.
- Performance → Targets uses the same canonical helper in memory; no extra queries.
- Setup assistant / profile detail: prop threading only.
- Inbox: `resolveConversationAuthz` adds one scope resolution and one request-cached identity read
  per conversation API call; the intelligence loader stays request-cached.

No N+1 was introduced; the Rep360 reads are one batch per request, not per row.

## Not measured

Production p50/p95, query counts under load, bundle-size delta, VPS worker/CPU/memory contention,
Aiven round-trip latency. All require the blocked staging/VPS access.

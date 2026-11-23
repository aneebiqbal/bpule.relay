# Performance results

## Honest statement first

**No defensible before/after performance comparison was produced.** The changes in this sprint
are authorization threading and UI state correctness. None intentionally alters query counts or
render cost, and the protected canonical writers were left structurally intact. Claiming a speed
improvement would be an estimate, not a measurement.

## What was measured

Local development server, macOS, Node 24, Turbopack. 15 sequential requests each, redirect
following disabled:

| Route | p50 | p95 | min | max |
|---|---|---|---|---|
| `/inbox-fixture` | 1 ms | 38 ms | 0 ms | 38 ms |
| `/login` | 0 ms | 1 ms | 0 ms | 1 ms |
| `/chats` (unauthenticated) | 0 ms | 1 ms | 0 ms | 1 ms |

These are **dev-server loopback timings on pre-compiled routes**, dominated by HTTP overhead.
They are not production latency, not TTFB to a real client, and not comparable across machines.
Recorded so the number is not mistaken for a benchmark.

## Structural cost review (unchanged by this sprint)

- `loadChatQueue` still reads leads + conversation states + identities + reps, with message
  previews limited to the visible page (`limit` capped at 200). Preview reads use the bounded
  `lead_message_previews` view when the capability is present, else at most 4 rows per lead.
- Count-only callers (sidebar badges, Rep Home) skip previews and coverage lookups entirely
  (`countOnly`).
- `getIntelligence` is React-`cache`d per request, so the pane and the drawer share one load.
- No N+1 was introduced: the new `resolveConversationAuthz` adds one scope resolution and one
  identity read per conversation API request, and reuses the request-cached workspace helper.

## Not measured

- Production p50/p95 server latency (no access; production must not be probed).
- VPS worker contention (no SSH).
- Bundle-size delta. `next build` succeeds; a bundle diff was not generated.
- Database round-trip counts under load.

Any of these require the blocked staging/VPS access described in `00-SPRINT-EXECUTIVE-SUMMARY.md`.

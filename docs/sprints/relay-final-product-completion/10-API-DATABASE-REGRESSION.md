# API & database regression

## Deterministic gates (final)

| Gate | Command | Result |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | clean |
| Unit + integration, no env | `npx vitest run` with `.env.local` removed | **exit 0 — 426 files passed / 1 skipped; 5966 passed / 19 skipped** |
| ESLint | `npx eslint .` | **0 errors**, 777 pre-existing warnings |
| Production build | `npm run build` | pass |
| Real-PostgreSQL transaction harness | `npm run qa:txn` | unchanged; writer untouched by this program except an additive zero-lane branch |

## Writer integrity

`saveWorkSetup` remains one physical transaction with fail-closed non-transactional adapters and
revision CAS. Changes made here:

- Allocation lane seeding fixed (prior sprint's SR-04).
- **Zero target**: explicit `0` now deactivates an existing lane instead of throwing or being
  dropped by the editor. Negative/NaN still rejected. No other semantic changed.

No migration was added or modified.

## Data-integrity contract checks

| Contract | Status |
|---|---|
| Atomic Work Setup | preserved |
| Revision conflict → 409 with committed row | preserved; UI now participates (prior sprint) |
| Seat membership & allocations | preserved; sum-per-lane validation intact |
| Daily targets / shared-lane accounting | aligned to one canonical personal rule |
| Rep activity / task ownership | untouched |
| Notification state | untouched |
| Conversation ownership | queue-aligned authority (prior sprint) |

## Failed-write behaviour

- Work Setup: 409 keeps the drawer open on the stale draft and disables Save; nothing is overwritten.
- Setup assistant / Rep360: partial failures are reported, not swallowed.
- Upwork history: non-2xx aborts the optimistic append.

# Admin and Work Setup

## Fixed in this program

| ID | Finding | Fix |
|---|---|---|
| SR-U5 | Profile detail hid people/coverage/knowledge from `MANAGE_REVENUE_IDENTITIES` managers while target editing (a different capability) was also hidden | `canManage` = admin/owner/`MANAGE_REVENUE_IDENTITIES`; `canManageTargets` = `MANAGE_TEAM_TARGETS`; the target editor is gated on the latter only |
| SR-U6 | Setup assistant attempted target writes its entry gate does not authorize; Rep360 ignored target responses | `canManageTargets` threaded from `/team` into the assistant (explicit skip log when absent); Rep360 checks every response and reports failures instead of closing as success |
| SR-U9 | Owner-only "Edit" button in `/admin/people` had no action | removed |
| P2 | Zero daily target silently ignored | writer deactivates the lane on explicit zero; editor sends zeros |

## Preserved contracts

- Atomic Work Setup transaction, fail-closed non-transactional adapters, revision computation and
  cross-org seat validation are unchanged.
- `saveWorkSetup` still writes one physical transaction; only the client's participation in CAS
  changed (prior sprint).
- Shared-lane accounting and the canonical ledger untouched.

## Not done

- Duplicate management writers still exist (Work Setup, profile target editor, setup assistant,
  Rep360 assign). They were audited and each now uses an honest capability check, but they were
  **not** consolidated — that is a structural refactor requiring an owner decision.
- `/team/[repId]` heatmap has no day drilldown; the false affordance was removed rather than
  building a new surface.

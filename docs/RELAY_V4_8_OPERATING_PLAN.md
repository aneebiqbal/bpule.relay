# RELAY V4.8 — Rep Operating Plan: production review outputs

> Generated from the production Neon database (`relay-production`, `main`) on 2026-11-10.
> Read-only audit; no rows were mutated by this document.

## 1. Null-profile sending identities (§47)

| Identity | Channel | Status | Organization | Classification |
|---|---|---|---|---|
| Muhammad Mazar | linkedin | archived | Muhammad Mazar | **ARCHIVED** — no action; already excluded from execution |
| Suhaib Ahmad | other | active | SuhaibAhmad | **REVIEW** — active `other` channel with no linked person, in a separate single-person org |

No active sending identity in the operating org (`bpulse`) has a null `profile_id`.
`groupAssignedProfiles` intentionally skips identities without a profile; the
`Suhaib Ahmad` row is flagged for an admin decision, not deleted.

## 2. Identity-less active leads (§48)

73 non-archived, non-test leads have no `revenue_identity_id`. They render as
"unassigned" in the Inbox and cannot be worked as a profile.

**By owner**

| Owner | Leads |
|---|---:|
| Ahmad | 47 |
| anas | 17 |
| Hassan | 6 |
| Aneeb | 3 |

**By status**

| Status | Leads |
|---|---:|
| contacted | 43 |
| new | 18 |
| replied | 6 |
| followed_up | 3 |
| lost | 1 |
| no | 1 |
| won | 1 |

**Review query** (run as the owner role; do not infer an identity from the
owner alone):

```sql
select l.id, l.contact_name, l.company, l.status, r.name as owner,
       l.created_at, l.last_activity_at
from leads l
join reps r on r.id = l.owner_rep_id
where l.archived = false and l.is_test = false
  and l.revenue_identity_id is null
order by r.name, l.created_at;
```

Backfill only where the sending identity is provable (a matching
`messages.sender_profile_id` / `leads.sender_profile_id`); otherwise leave the
lead unassigned and let the admin resolve it from the review surface.

## 3. Archived-identity target lanes (§46)

Already resolved by `20261110030000_operational_reconciliation.sql`:
`0` active `daily_targets` rows remain on archived identities. The backup table
`relay_stale_target_cleanup_20261110` was created empty (nothing to back up).

## 4. Acceptance-case baseline (pre-UI)

| Rep | Person · Channel | Target/day |
|---|---|---:|
| Ahmad | Mehak Seedat · LinkedIn | 102 |
| Ahmad | Mehak Seedat · Upwork | 12 |
| **Ahmad total** | | **114** |
| Dawood | Hassan Saulat · LinkedIn | 115 |
| Dawood | Hassan Saulat · Upwork | 17 |
| **Dawood total** | | **132** |
| Hassan | Fizza Iqbal · LinkedIn | 86 |
| Hassan | Fizza Iqbal · Upwork | 7 |
| Hassan | Zaira · Upwork | 7 |
| **Hassan total** | | **100** |

These values come from `daily_targets` and match the canonical executable scope
(PRIMARY coverage). No backup-only lane carries a target.

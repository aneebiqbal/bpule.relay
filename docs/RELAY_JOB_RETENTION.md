# Relay — Job Retention & Lifecycle

**Branch:** `feat/relay-job-intelligence-v2`
**Authority:** `src/lib/job-discovery/inventory.ts`
**Status:** implemented. No job row was deleted.

---

## 1. Lifecycle is separate from application state

A job has a **lifecycle** (driven by the source and the feed index). A person's
relationship to it is **application state** (`saved_jobs`, `applications`,
`prepared_jobs`, `application_documents`). Archiving a job never deletes an
application or a document.

```
discovered → verification_needed → verified_open / recently_seen
           → closed / expired / source_unavailable
feed buckets: recommended | eligible_low | eligibility_unknown
              stale_unverified | duplicate | not_remote | location_restricted | closed
```

`include_in_feed` is the single switch that hides a job from the actionable
feed. It is recomputed, never hard-deleted.

## 2. What the maintenance pass does

`reindexJobInventory` (run by the existing `job-inventory` systemd timer, every
15 minutes):

1. Recomputes Pakistan eligibility and requirements for every job.
2. Recomputes the feed bucket from freshness, verification, duplicate and
   eligibility signals.
3. Upserts `job_inventory_index` (non-destructive; no `jobs` row is deleted).
4. Writes back eligibility/requirements JSON to `jobs` when they changed.

A source outage (`source_unavailable`) is **not** a closure. Only an explicit
`closed` / `expired` verification state removes a job from the feed.

## 3. Dry-run retention report

`GET /api/cron/job-retention` (cron secret) → `buildRetentionReport`:

```
counts: total, active, recommended, prepared, applied,
        stale, closed, duplicated, archived,
        referencedByApplications, eligibleForCleanup
buckets: { recommended, eligible_low, … }
cleanupSample: [ { id, title, company, reason } ]   // first 20
```

```bash
curl -s -H "Authorization: Bearer $CRON_SECRET" \
  "https://<host>/api/cron/job-retention?sample=20" | jq '.counts'
```

Measured on the real organization (2026-11-23):

| Count | Value |
|---|---:|
| total | 1,430 |
| active | 1,430 |
| recommended | 5 |
| stale | 78 |
| duplicated | 130 |
| referenced by applications | 0 |
| eligible for safe cleanup | 208 |

Nothing was deleted. `eligibleForCleanup` is a **candidate** set (stale or
duplicate, with no application and no saved row); a human confirms before any
physical cleanup.

## 4. Policy (configurable, documented)

| Signal | Default | Effect |
|---|---|---|
| Closed / expired at source | immediate | excluded from feed |
| Duplicate of a canonical listing | immediate | excluded from feed |
| Not remote | immediate | excluded from feed |
| Pakistan excluded (confirmed) | immediate | excluded from feed |
| Published > 60 days ago | stale | excluded from feed |
| `verified_open` not re-verified in 14 days | stale | excluded from feed |
| Unverified not seen in 14 days | stale | excluded from feed |
| Saved / applied / has documents | always | retained in history |

## 5. Simplified workspace

The primary Jobs screen exposes five action views plus discovery:

| Tab | View | Content |
|---|---|---|
| Ready Today | `shortlist` | recommended + next-best eligible roles |
| Prepared | `prepared` | complete packages awaiting review |
| In Progress | `in-progress` | saved / reviewing / preparing / applied / follow-up |
| History | `history` | applied, closed, expired, dismissed |
| Discover | `latest` | broader search over the live feed |
| Sources & Health | `sources` | admin only |

The previous seven overlapping tabs (`for-you`, `verified-remote`, `saved`,
`applications`, `documents`) remain valid deep links but are no longer tabs.

# Relay V5 — Deployment & Operations

**Status:** ready to merge / staging-deploy. **Not deployed.**

---

## 1. What is new

- `GET /api/cron/job-verification` + `deploy/job-verification.{service,timer}`.
- `jobs.requirements` jsonb (migration `20261120150000_job_requirements.sql`),
  populated by the inventory reindex.
- Resume templates: Modern / Technical / Minimal / **Ultra ATS**; A4 + US
  Letter; clickable PDF links.
- Two-score ATS assessment stored on each generated CV.

## 2. Migrations

```bash
SERVICE_DATABASE_URL=... bash scripts/apply-pending-migrations.sh
```

Both databases are at **198 migrations**, `failed=0`.

## 3. Timers

`deploy/install-job-discovery.sh` installs all three timers:

| Timer | Interval | Budget |
|---|---|---|
| `job-discovery` | 15 min | 4 sources, 8 s HTTP, 220 MB / 30 % CPU |
| `job-inventory` | 15 min | full reindex, 180 MB / 25 % CPU |
| `job-verification` | 10 min | 24 URLs, 8 s, concurrency 6, 140 MB / 25 % CPU |

```bash
bash deploy/install-job-discovery.sh
sudo systemctl start job-verification.service   # manual tick
journalctl -u job-verification.service -e
```

Dry run / counts only:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/job-verification?dryRun=1"
curl -fsS -H "Authorization: Bearer $CRON_SECRET" \
  "http://127.0.0.1:3000/api/cron/job-inventory?dryRun=1"
```

## 4. Rollback

```bash
sudo systemctl disable --now job-verification.timer
sudo rm /etc/systemd/system/job-verification.{service,timer}
sudo systemctl daemon-reload
```

The `job_inventory_index` table and the `jobs.requirements` /
`content_changed_at` / `source_updated_at` columns are additive derived data;
leaving them in place is harmless. Revert the code commit to restore the old
behaviour.

## 5. Pre-production checklist

- [ ] Rotate the exposed `avnadmin` credential in the Aiven console; verify the
      old password fails.
- [ ] Confirm `relay_app` / `relay_service` permissions are unchanged.
- [ ] Benchmark the third timer on the 1-vCPU / 4-GB VPS (local: ~4 s reindex +
      ~30 s verification sweep at 1,430 jobs).
- [ ] Confirm document privacy: `application_documents` is scoped by
      `organization_id`, `job_id`, `profile_id`.
- [ ] Confirm the verification sweep never closes a job on 403 / timeout.
- [ ] Post-deploy smoke: `/api/version` SHA, `/api/me/status`, shortlist shows
      verified roles, generate a package and download A4 PDF + ZIP.

## 6. GO / NO-GO

**GO for merge and staging deploy.** Build, tests, migrations, browser
acceptance and the render matrix are green.

**NO-GO for production deploy until** the `avnadmin` rotation is confirmed, the
VPS benchmark is measured, and explicit authorization is given.

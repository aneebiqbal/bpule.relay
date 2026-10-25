# PII in Git — Exact Remediation Plan

**Finding ID:** P0-5 · **Severity:** P0 (Security / GRC) · **Status:** OPEN (not auto-fixed)
**Repo:** `aneebiqbal/bpule.relay` (private) · **Discovered:** 2026-10-24

> This document contains **no secrets**. It is instructions for the team, not an automated action.

---

## 1. Inventory (verified)

| Field | Value |
|---|---|
| Path | `audit-reports/historical-intelligence/` |
| Files tracked | **39** |
| Size | **41 MB** |
| Present at HEAD | **yes** |
| Introduced | 2026-09-29 |
| Commits touching the path | `8ca7c6c`, `c3c1f94`, `b0c1957` (all 2026-09-29) |
| `.gitignore` coverage | **none** |

**Files (names):** `00_counts.json`, `01_DATASET_SUMMARY.md`, `02_LEAD_AUDIT.csv`, `03_MESSAGE_AUDIT.csv`, `04_HIGH_RISK_RECORDS.md`, `05_SCORING_REPORT.md`, `06_MESSAGE_QUALITY_REPORT.md`, `07_TEAM_OUTPUT_REPORT.md`, `08_VERSION_DRIFT_REPORT.md`, `09_REANALYSIS_QUEUE.csv`, `10_EXECUTIVE_REPORT.md`, `11_REVIEWER_GPT_BRIEF.md`, `12_REMEDIATION_VALIDATION.md`, `13_REPLAY_COMPARISON.csv`, `PRODUCTION_TEST_PROFILES.md`, `ai_traces.json`, `captured_prospects.json`, `content_drafts.json`, `conversation_states.json`, `eval_runs.json`, `golden_set.json`, `issues.json`, `lead_audit.json`, `leads_basic.json`, `leads_intelligence.json`, `leads_raw_sources.json`, `message_audit.json`, `messages.json`, `orgs.json`, `outcomes.json`, `prepared_email_drafts.json`, `profiles.json`, `quality-test-results.json`, `relay_runs.json`, `replay-summary.json`, `reps.json`, `revenue_identities.json`, `upwork_jobs.json`, `upwork_messages.json`.

**PII confirmed present:** real prospect/person names and headlines, ~161 real email addresses, ~118 LinkedIn URLs, company names, message bodies, Upwork job text, AI traces, rep records. This is production personal data.

## 2. Why this is the worst finding

The repository itself is the exposure, independent of the Supabase project's RLS. Anyone with read access to the repo (current or future, including forks, cached views, CI caches, backups, and anyone the repo is shared with) holds production PII. Deleting the files in a new commit does **not** remove them from history.

## 3. Remediation — exact steps

### Step 0 — Freeze and assign (do first)
1. Designate one owner. Do not merge unrelated work into the remediation branch.
2. Take a backup of the 3 commits (`git bundle`) **before** rewriting history, stored outside the repo.

### Step 1 — Stop the bleed (non-destructive, do immediately)
Add to `.gitignore`:
```
audit-reports/historical-intelligence/
audit-reports/**/*.csv
```
Commit this on `main` so no future run re-adds the dump.

### Step 2 — Confirm what is personal data (GRC)
Have GRC/legal confirm the classification of each file. Until they sign off, treat the whole directory as personal data.

### Step 3 — Rewrite history (destructive; requires coordination)

**Option A — `git filter-repo` (recommended):**
```bash
# Install: pip install git-filter-repo  (or brew install git-filter-repo)
# Work on a FRESH clone; never on a shared working copy.
git clone https://github.com/aneebiqbal/bpule.relay.git relay-purge
cd relay-purge
git remote remove origin        # safety: prevent accidental push
git filter-repo --path audit-reports/historical-intelligence --invert-paths --force
```

**Option B — BFG Repo-Cleaner:**
```bash
java -jar bfg.jar --delete-folders historical-intelligence --no-blob-protection relay-purge
cd relay-purge && git reflog expire --expire=now --all && git gc --prune=now --aggressive
```

### Step 4 — Rotate credentials (same window)
The remote URL embeds a token (`https://<token>@github.com/...` in `.git/config`). Because the token appears in `.git/config` on every clone and possibly in CI logs:
1. Revoke/rotate the GitHub token.
2. Reset the remote to a plain URL: `git remote set-url origin https://github.com/aneebiqbal/bpule.relay.git` and use a credential helper or SSH.
3. Rotate any other secret that appears in the dumps (check `ai_traces.json`, `prepared_email_drafts.json`).

### Step 5 — Collaborator coordination (before force-push)
1. Announce a freeze window. Every clone must be discarded or re-based.
2. Force-push: `git push --force-with-lease origin main` (and any affected branch).
3. Every collaborator: `git fetch && git reset --hard origin/main` on a clean tree. **Do not merge** — it would resurrect the blobs.
4. Delete and re-clone CI runners / caches that hold the old objects.

### Step 6 — Purge external caches
- GitHub cached views of the old commits: open a GitHub Support request to purge cached pages and the commit API for the removed SHAs.
- Vercel/CI build caches, preview deployments, and any artifact store that snapshotted the repo.

### Step 7 — Verification (must pass before closing)
```bash
# 1. No path in any commit:
git log --all --oneline -- audit-reports/historical-intelligence   # must be empty

# 2. No blob in the object database:
git rev-list --all --objects | grep historical-intelligence        # must be empty

# 3. No PII string anywhere in history:
git grep -I -l -e '@' $(git rev-list --all) -- audit-reports 2>/dev/null | head

# 4. Working tree clean of the directory:
ls audit-reports/historical-intelligence 2>&1   # must be "No such file or directory"
```
Additionally, ask GitHub to scan/confirm the sensitive-data removal. Record the verification output in this document.

## 4. What NOT to do
- Do not delete only the working-tree files and commit; history retains them.
- Do not rewrite history on a shared working copy.
- Do not push the remediation branch with `--force` before notifying collaborators.
- Do not print secrets in this document or in tickets; reference them by name only.

## 5. Acceptance
P0-5 is closed only when: the path is absent from `main` **and** from all of history; `.gitignore` protects it; the remote URL no longer embeds a credential; the token is rotated; GitHub caches are purged; and the Step 7 commands return empty.

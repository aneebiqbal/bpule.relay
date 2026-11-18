# Relay Sprint 8 — Real team structure, archived hidden

Branch `feat/relay-completion-program`. Commits `3444d593`, `d43903a5`,
`ef953e20`. Pushed; not deployed.

## 1. What the directory was showing (and why it was wrong)

`/team/profiles` and `/admin/control-center` rendered cards for retired and
test records, and Fizza Iqbal showed **No primary / Ambiguous ownership**:

| Symptom | Root cause |
|---|---|
| `V6 live fixture` card | the identity query ignored the profile's `archived_at` |
| `testing` card | orphan profile not filtered (fixed in `3444d593`) |
| `archived` channel rows under a person | directory listed `status = 'archived'` identities |
| Fizza: no primary | a person row is keyed by the canonical profile, and `loadCanonicalProfileAssignments` only returns profiles that carry an identity — Fizza's canonical profile has none |

## 2. Fixes (`src/lib/team/profiles.ts`)

- Identities are filtered by their profile's archive state and by
  `status !== 'archived'`; live-built rows for archived profiles are dropped.
- Person ownership is merged across every profile in the person group:
  a `coverage`-sourced primary wins, operators/backups/assigned reps are
  unioned, strongest coverage state is kept.

## 3. Production data set to the real structure

Applied through `POST /api/team/profiles/[profileId]/coverage` (the canonical
service, admin actor). Both channel profiles of a person carry the same seats.

| Person | PRIMARY | OPERATOR |
|---|---|---|
| Aleena Saman (linkedin) | Madiha | — |
| Fizza Iqbal (linkedin, upwork) | Hassan | Aneeb |
| Hassan Saulat (linkedin, upwork) | Dawood | Madiha |
| Madiha Irfan (upwork) | Madiha | — |
| Mehak Seedat (linkedin, upwork) | Ahmad | — |
| Muhammad Aneeb (linkedin, upwork) | Ahmad | Dawood |
| Zaira Upwork (upwork) | Ahmad | Hassan |

Verified in the rendered directory — every person shows exactly this
primary/operator pair.

## 4. Test data removed

| Record | Action |
|---|---|
| `V6 fixture` (profile + linkedin identity, 2 assignments, 4 targets, 4 coverage) | deleted |
| `testing` (profile + enrichment run) | deleted |
| empty duplicate `Aleena Saman` profile | deleted |

Remaining: **15 profiles, 13 active** — all real. The two archived profiles are
duplicate records of real people (`Hassan Saulat`, `Aneeb Iqbal`), kept for
history and hidden from the operating views.

## 5. Known debt (not user-visible)

`profile_coverage` holds **1,302 rows / 18 active** — the table's documented
design is "deactivate, don't delete", so repeated test runs left ~1,284
inactive rows. They render nowhere. Purging them is optional hygiene; it would
discard seat history.

## 6. Gates

| Gate | Result |
|---|---|
| TypeScript | clean |
| Standalone build | exit 0 |
| Unit | 397 files / 5,773 passed |

# Relay — Jobs and AI Quality

**Verified statically + prior live passes; no live AI provider exercised here.**

## 1. Job Intelligence

| Area | Status | Evidence |
|---|---|---|
| Default Jobs view is a shortlist | verified | `src/app/(app)/jobs/page.tsx:18,54-58` — `shortlist`, `ensureJobMatches` bounded to 200 recent live jobs |
| Unsafe apply/source URLs | verified | `isSafeApplicationUrl` at ingest (`job-discovery/ingest.ts:267-268`) and UI (`job-detail.tsx:313`, `jobs-workspace.tsx:574`) |
| Preparation idempotency | verified | `prepared_jobs.idempotency_key` lookup before insert (`preparation.ts:241-246`) |
| Notify once | verified | `notifyOnce` + `job-prepared:${key}` (`preparation.ts:301-308`) |
| Preparation audit | verified | `preparation_logs` insert (`preparation.ts:39`) |
| Eligibility / matching | prior passes | `docs/RELAY_V8_JOB_MATCHING_AND_STUDIO.md` |
| Resume Studio / PDF / DOCX / ZIP | prior passes | `docs/RELAY_V6_RESUME_STUDIO_AND_AUTONOMOUS_PREPARATION.md` |
| Application submission | not automatic | apply links are user-initiated; no auto-submit found |

## 2. AI routing

- Canonical: `src/lib/ai/runtime/*` (used by 20+ modules).
- Legacy: `src/lib/ai/routing.ts` still imported by `draft.ts`, `draft-stream.ts`,
  `provider.ts`, `forge.ts` (**R-07**, P2, open).
- Claim safety: screening answers return `needs_human` with null answers for
  facts Relay does not hold (prior browser evidence, `RELAY_FINAL_BROWSER_ACCEPTANCE.md` §2.1).
- Provider failure/timeout/invalid-JSON/partial-output: **not exercised** (N-05).

## 3. Content Studio / Growth

- `/content-v2/growth` is the live Growth surface; `/content/growth` and
  `/admin/growth` redirect or are dead.
- Superseded API families remain unreferenced (`/api/growth/{decision,draft,...}`,
  `/api/content/intelligence/{discover,forge,interview,org-themes}`).
- Not deleted in this pass.

## 4. Open

- R-07 duplicate AI routing.
- No live verification of prompt versioning / cache isolation in this pass.

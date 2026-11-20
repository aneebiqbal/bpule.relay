# Relay V5 — CV Architecture

**Status:** implemented and unit-verified. Visual QA in
`RELAY_V5_PDF_VISUAL_QA.md`.

---

## 1. Principles

1. **One canonical applicant identity.** Every document is built from the
   authorized `Profile` + `ProfileEvidence` for that profile only.
2. **No invented facts.** A bullet, date, employer, degree, certification,
   outcome or metric must exist in verified evidence.
3. **No cross-profile leakage.** The resume builder is a pure function of the
   supplied evidence; there is no shared cache or global state.
4. **Job-specific CVs are derived, never independent.** Tailoring reorganizes
   and re-emphasizes existing facts; it does not create a parallel resume.

## 2. Master resume (`buildResumeData`)

`src/lib/job-discovery/documents.ts` normalizes the profile into a structured,
versionless master resume (`ResumeData`):

| Section | Source |
|---|---|
| name / title | `profile.displayName` / `currentRole` / `headline` |
| summary | `profile.professionalSummary` / `bio` |
| skills | primary + secondary + technologies + proof-card tags + project technologies |
| experience | `evidence.experience` (company, role, dated period) |
| experience bullets | approved `proofCards.safeClaim` lines, matched to the role by capability / tags |
| projects | `evidence.portfolioProjects` (description, technologies, outcome) |
| certifications | proof cards with `sourceType = certification` |
| links | verified `profileUrl` + proof-card source references |

Every bullet is a verbatim approved proof claim. Proof that does not name a role
is attached to the most recent role so it stays traceable.

## 3. Tailoring (`tailorResumeForJob`)

Deterministic, then optional AI rewriting:

1. Extract structured requirements (`requirements.ts`).
2. Reorder skills so required skills lead.
3. Reorder experience bullets so technology-relevant bullets lead.
4. Reorder projects by technology overlap.
5. Rewrite the summary to reference the target stack **only if the base summary
   already mentions it**; otherwise append a truthful "seeking to apply" line.
6. AI rewriting (cover letter / proposal) is budget-limited and passes the same
   claim gate as the rest of Relay (`evaluateCoverLetter`).

## 4. Change explanation

Every generated document carries:

- `evidenceUsed` — the proof cards / links used.
- `unsupportedClaims` — claims the gate rejected.
- `warnings` — format / completeness issues.
- `ats` — the legacy requirement report.
- `atsAssessment` — the V5 two-score assessment (see the ATS spec).

A human edit is stored as a **new version**; automatic generation never
overwrites a human-edited version.

## 5. Templates

Four layouts in `pdf.ts` / `docx.ts`:

| Template | Use | Font | Notes |
|---|---|---|---|
| Modern professional | general / technical | Helvetica 10.5 | default |
| Technical engineering | senior engineers | Courier 9.5 | monospace stack |
| Minimal corporate | leaders / founders | Helvetica 9.5 | wide margins |
| Ultra ATS | parsing reliability | Helvetica 10 | single column, minimal styling |

Paper sizes: **US Letter** (612×792 pt) and **A4** (595×842 pt), selectable in
the UI and on the download URLs. PDF links are emitted as `/Annot /Subtype
/Link` URI annotations.

## 6. Identity scope

`profileId` is resolved from the authorized session and is required by every
document route. The service layer filters all document rows by
`organization_id`, `job_id` and `profile_id`. A test asserts that another
profile's proof claim never appears in a generated resume.

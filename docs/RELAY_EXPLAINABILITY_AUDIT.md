# Relay Explainability Audit

**Release-gating artifact.** Every explanation must be both *truthful* (the
evidence is real and sourced) and *useful* (the evidence is relevant to the
dimension it sits under). Correct extraction with badly chosen evidence is a
defect: the rep acts on a reason that does not support the conclusion.

---

## The mechanism

- `src/components/score-breakdown.tsx` renders each dimension with its evidence,
  split into `quote` (verbatim), `signal` and `inference`.
- Dimensions are grouped into `model` and `signals` rows.
- A dimension with no stored evidence is surfaced (`noStoredEvidence`), so an
  empty explanation is visible rather than silently empty.

## Dimension → evidence rule

| Dimension | Evidence must be |
| --- | --- |
| Buyer Intent | A buyer request only — not seller promotion, not a quoted customer |
| Commercial Potential | Company / build / capacity evidence |
| Authority | The current role, not a past title |
| Timing | Dated current activity or a request |
| Access | Connection / contact facts |

**Forbidden:** showing "Education" as Commercial Potential evidence merely
because it was nearby text; showing a past role as Authority; showing seller
promotion as Buyer Intent.

---

## Gap

There is no regression set that pins *evidence selection* separately from
extraction. A fixture can extract correctly and still attach irrelevant
evidence, and nothing fails.

### Remediation (Phase 17, not done in this sprint)

Add fixtures where extraction is correct but evidence selection is bad:

- a past role attached to Authority
- an education line attached to Commercial Potential
- a seller-offering line attached to Buyer Intent
- a dated historical post attached to Timing when a current one exists

Each asserts the evidence kind and dimension, so a future change cannot quietly
make an explanation plausible-but-wrong.

---

## Related

- Contract 4 (`buyer-intent.ts`) already prevents seller promotion from becoming
  a verified buyer request — the strongest explainability guard that exists.

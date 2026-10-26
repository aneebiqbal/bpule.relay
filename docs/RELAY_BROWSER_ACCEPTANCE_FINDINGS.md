# Relay Browser RC Acceptance — Findings

**Release-gating artifact.** Findings from the browser acceptance pass against the
exact preview. Each entry is either a **test defect** (my assertion was wrong) or
a **product finding** (a real inconsistency worth a fixture).

---

## Test defects (assertion was wrong, product is correct)

### T1 — Budget is not rendered on the Prospect card

The Prospect result card shows FIT / INTENT / DECISION CONFIDENCE / CONNECTION,
the rationale, "Strongest evidence" and "Missing evidence". It does **not**
render the budget or timeline as a field. The buyer's own request is retained
verbatim as the grounding quote ("Use: We need an external software team to
rebuild our dispatch platform in React and Node.").

Budget retention is verified by the unit corpus
(`tests/fixtures/relay-regression-corpus.ts`) and the buyer-intent authority
(`resolveVerifiedBuyerIntent` returns `verifiedBudget: true`). A browser
assertion for a literal `$90,000` on the card is wrong.

### T2 — Three verdict states, not two

The verdict is one of **"Worth pursuing"**, **"Worth skipping"**, or
**"Maybe — needs more signal"** (mid band). A wait/assert that matches only the
first two times out on a valid mid-band result (HANNAH = 5/10, canonical
50/100).

### T3 — The streaming status line contains the verdict words

"Complete — score 73/100 (Worth pursuing)" appears in the status line before
the result card renders. Waiting on `/Worth pursuing|Worth skipping/` resolves
too early. The stable marker is `/Display score \d+\/10/`.

### T4 — A paste with no company is not a prospect

JURICA's paste names no company, so the correct outcome is
**"NOT A PROSPECT — This paste can't be qualified — it doesn't describe a
prospect"** with "Lead not eligible". It is not a low-priority observe lead.

### T5 — DANIEL gets a builder connection note, not a buyer pitch

DANIEL (a recruiting-platform founder, i.e. a product builder) resolves to
INTENT UNKNOWN and a skip-band score (1/10, canonical 0/100), with the rationale
*"Active founder/builder with no explicit buyer request. Connection note earns
access — do not pitch."* The seller→buyer bug is fixed; the connection note is
the deliberate Contract-2 builder path, not a buyer pitch.

---

## Product findings

### P1 — The Prospect card contradicts itself on EMMA (explainability)

For EMMA (a source-verified external request), the card shows:

- **INTENT: HIGH** — the canonical V3 buyer intent, correctly credited
  (Contract 4 holds).
- **Missing evidence: "No clear need signal from evidence."** — the V2 legacy
  watchOut (`src/lib/intelligence-v2/scoring-engine.ts:581`).
- Rationale: *"HIGH fit, UNKNOWN intent, MEDIUM confidence. A relevant change
  exists, but they have not asked for help."*

So the card simultaneously says the buyer asked for help (INTENT HIGH) and that
they have not (rationale + watchOut). The rationale's "UNKNOWN intent" is the
`assessFitIntentConfidence` notion, not the canonical `buyerIntentLevel`.

This violates the spirit of Contract 3 (one canonical state per surface) and the
explainability rule in `docs/RELAY_EXPLAINABILITY_AUDIT.md`: an explanation must
be truthful and useful. **The decision is correct; the explanation contradicts
it.**

**Suggested fix (not done):** the Prospect card should render the V3 canonical
intent in the rationale, or suppress the V2 watchOut item when the canonical
intent is HIGH. Either way, the card must not say "they have not asked for help"
about a lead whose canonical intent is a verified request.

---

## Cases verified in the browser

| Case | Outcome |
| --- | --- |
| NADIA | INTENT HIGH, "current, explicit need", CONNECT WITH NOTE, request quote retained, no "No verified buyer request", no "No buyer timing" |
| HANNAH | INTENT HIGH, "current, explicit need", not skip band, no "No verified buyer request" |
| EMMA | INTENT HIGH (request credited), no "No verified buyer request" — plus finding P1 |
| DANIEL | INTENT UNKNOWN, skip band, "no explicit buyer request", seller not a buyer |
| JURICA | Not a prospect (no company) — no outreach offered |
| PARAPHRASED | INTENT HIGH, "current, explicit need" |
| MOBILE 375px | Today renders with no horizontal overflow |

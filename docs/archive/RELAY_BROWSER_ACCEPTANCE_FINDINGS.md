# Relay Browser RC Acceptance — Findings

**Release-gating artifact.** Findings from the browser acceptance pass against the
exact preview. Each entry is either a **test defect** (my assertion was wrong) or
a **product finding** (a real inconsistency worth a fixture).

## Scope status — READ THIS FIRST

**BROWSER SUBSET: PASS** — not "BROWSER RC: PASS".

Eight Prospect-surface cases were exercised against a local production build:
NADIA, HANNAH, EMMA, DANIEL, JURICA, ABDULHAKIM, PARAPHRASED, MOBILE.

The following release cases were **NOT run** and must pass before a browser RC
claim: ETHAN terminal, inbound-first, no-thread, multi-question reply, Today
counter parity, the full score-parity matrix, Studio regenerate, Upwork
unknown-values, and production smoke.

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

**Status: FIXED.** `assessFitIntentConfidence` now honors the canonical
`externalNeed`, so the rationale reads "HIGH fit, HIGH intent". The prospect
route also filters explanation lines through
`filterContradictoryExplanation`, so a line that denies a verified request,
claims a thread, or offers contact to a terminal lead is removed and recorded as
a contract violation. Regression set:
`tests/qa-relay-explanation-consistency.test.ts`.

---

## Cases verified in the browser

| Case | Outcome |
| --- | --- |
| NADIA | INTENT HIGH, verified request, budget $90,000 retained, request quote retained, no "No verified buyer request", no "No buyer timing" |
| HANNAH | INTENT HIGH, verified request, budget $75,000 retained, not skip band |
| EMMA | INTENT HIGH (request credited), no "No verified buyer request" — P1 fixed |
| DANIEL | INTENT UNKNOWN, no verified request — seller grammar is not a buyer request |
| JURICA | Not a prospect (no company) — no outreach offered |
| ABDULHAKIM | INTENT HIGH, verified request, budget $120,000 retained |
| PARAPHRASED | INTENT UNKNOWN — an experience question is a buyer *question*, not a request to buy |
| MOBILE 375px | Today renders with no horizontal overflow |

## Findings from the local production build

### F1 — The V3 canonical explanation is richer than the V2 one

On the V3 path the rationale reads: *"Intent: HIGH (verified request). Commercial
potential: medium. Explicit buyer request detected (verified). Budget stated:
$90,000 (approved). Strong capability fit."* On the V2 path it reads *"HIGH fit,
HIGH intent, MEDIUM confidence. There is a current, explicit need …"*. Both are
consistent with the decision; the V3 wording additionally surfaces the budget.
The browser assertions accept either wording.

### F2 — ABDULHAKIM is a verified buyer, not an observe-only builder

The source contains *"We are looking for an external engineering team to help
build our mobile apps. Budget approved: $120,000."* — a prospect-owned external
request with a budget. INTENT HIGH is therefore **correct** (Contract 4). The
earlier acceptance expectation of UNKNOWN intent was stale for this source.

### F3 — A paraphrased experience question is a question, not a buying request

*"Curious whether your team has handled this kind of migration before."* is
extracted as an EXPERIENCE buyer question (unit eval, 107 cases) but correctly
does **not** upgrade to a verified buyer request, so intent stays UNKNOWN.
Question coverage and buyer intent are separate axes.

### F4 — BUG-004 was a visibility bug, not a persistence bug

An inbound lead created through `/api/inbound/lead` stored correctly
(`status: new`, `archived: false`, one canonical `messages` row keyed
`inbound_first:<id>`) but disappeared from Today.

**Root cause.** `buildRelayQueue`'s dedicated inbound branch iterated
`input.allLeads`, and the dashboard passes `allLeads: []`, so the branch never
ran. Inbound-first leads were also not `send`-verdict or STRONG-band, so no
other branch picked them up.

**Fix.** The branch now scans the owned queue as well as `allLeads`,
de-duplicated by id. An inbound lead with a canonical message produces an
`inbound_opportunity` task regardless of sender assignment. No scoring,
buyer-intent or persistence change.

**Regression fixtures.** `tests/qa-relay-inbound-visibility.test.ts` — inbound
with/without sender, outbound-only, terminal inbound, and the no-duplicate case.

**Browser spec corrections (test bugs, not product bugs):** the detail heading
is the contact name; tabs are client-side (`?tab=conversation` is ignored);
Chats/Today links carry `?tab=conversation`; Archive's top section is
"every thread you own", so only its "Archived leads" section is strict.

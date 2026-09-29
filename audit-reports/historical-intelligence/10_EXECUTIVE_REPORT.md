# 10 — EXECUTIVE REPORT

## Is Relay Working?

**PARTIALLY**

Relay's extraction pipeline is operational and produces structured intelligence, but there are **systemic quality issues** that make the current output unreliable for daily production use without human review.

---

## 1. Extraction Quality

**Reliable: ~60%** (175/291 leads have no material factual error)

**Systematic failures:**
- **33% of leads (96) are competitors** — software development companies misclassified as buyers
- **Service providers misread as buyers** — fractional CTOs, consultants offering services are scored as "Strong opportunity"
- **"Source URL: other" bug** — evidence entries with no actual content
- **No raw source on leads table** — raw_input only accessible through intel JSON blob

**What works:**
- Person name extraction: ~98% accurate
- Company name extraction: ~95% accurate
- Title extraction: ~90% accurate
- LinkedIn URL extraction: ~85% accurate

---

## 2. Evidence Quality

**Error Rate: ~50%** (1280 out of 2589 evidence entries are scoring dimension artifacts, not real evidence)

**Critical finding:** The evidence ledger is **systematically polluted** with scoring dimension labels stored as evidence entries. 190 out of 191 scored leads (99.5%) and 746 out of 753 captured prospects (99.1%) are affected.

This is a **fundamental design flaw** — the evidence ledger should contain actual evidence about the prospect, not scoring metadata.

**Real evidence quality:**
- When actual evidence exists, it's mostly accurate
- Hiring signals are correctly detected
- Technical signals are correctly identified
- But buyer intent is frequently over-interpreted

---

## 3. Scoring

**Believability: LOW**

**88% of scored leads (168/191) score above 60.** This is not a realistic distribution for cold outreach.

**Inflation sources:**
1. Competitor misclassification (57 leads, scores up to 91)
2. Evidence ledger pollution (190 leads)
3. Remote eligibility auto-81% (most get full points)
4. Hiring = buyer assumption (hiring for own team treated as outsourcing need)

**Dimension averages are all above 50%** — no dimension is being used to differentiate.

**Legacy scoring is broken:** 74.6% of leads have the maximum legacy score (10-12).

---

## 4. Qualification

**Agreement with independent evaluator: ~2.4%** (only 7/291 agree)

This extreme disagreement is partly due to the automated evaluator's strictness, but the core issue is real: Relay qualifies almost everything as "send" or "research_more" while the evidence supports "skip" for most.

**False positive rate: ~70%** — Relay suggests outreach when there is no credible buyer intent.

**False negative rate: Unknown** — insufficient outcome data to determine if Relay is missing real opportunities.

---

## 5. Message Quality

**Sendable rate: 64.3%** (396/616 messages are GOOD or MINOR_EDIT)

**Unacceptable rate: 35.7%** (220/616 should not have been generated)

**Recurring problems:**
1. **Generic templates** — "Hey! Saw your company is growing..." appears verbatim for multiple leads
2. **Wrong company** — 220 messages target competitors
3. **No real personalization** — "I noticed..." / "I see that..." patterns
4. **Premature pitching** — connection notes contain sales pitches
5. **CTA issues** — 204 messages have no clear or inappropriate CTA

**By model quality:**
- OpenAI (tier4): Best quality
- Groq (tier1): Mixed, sometimes awkward
- OpenCode (tier1): Variable
- Seed/prospect-check: Completely generic

---

## 6. Persona Quality

**Cannot be fully evaluated** — sender_profile_id is null for most leads and messages.

The revenue identity system exists (9 identities configured) but is not consistently applied to leads or messages.

---

## 7. Team Consistency

**All team members share the same systemic issues:**
- Evidence pollution: 99%+ affected across all reps
- Competitor misclassification: 25-40% of each rep's leads
- Message quality: Similar distributions across reps

Differences between reps are primarily due to volume and model selection, not system behavior.

---

## 8. Historical Debt

| Category | Records | Action |
|----------|---------|--------|
| Evidence ledger pollution | 190 leads + 746 prospects | REPROCESS |
| Competitor misclassification | 57 leads | RECLASSIFY |
| Messages to competitors | 220 messages | DELETE/REGENERATE |
| Legacy scored (no canonical) | 100 leads | RESCORE |
| Seed/template messages | 72 messages | REGENERATE |
| **Total needing action** | **~1,375 records** | |

---

## 9. Current Pipeline Assessment

**All data from September 2026, single pipeline version.** No historical comparison possible.

The current pipeline (runtime-v3, relay_qualification_v2) has the same issues as the "historical" data because they ARE the historical data — all generated in the same 14-day window.

---

## 10. Top Systemic Problems (Root Causes)

1. **Evidence Ledger Design Flaw** — Scoring dimensions stored as evidence entries, polluting 99% of ledgers
2. **No Competitor Detection** — Software dev companies not distinguished from buyers
3. **Service Provider Misinterpretation** — "I help companies..." read as "I need help"
4. **Score Inflation** — All dimensions average >50%, 88% of leads score >60
5. **Hiring = Buyer Fallacy** — Any hiring signal treated as outsourcing intent
6. **Remote Eligibility Auto-Max** — 81% average, given too easily
7. **Generic Template Messages** — Seed/prospect-check models produce identical output
8. **No Outcome Feedback Loop** — Only 9 outcomes recorded, can't validate scoring
9. **Missing Telemetry** — ai_traces and relay_runs tables are empty
10. **No Raw Source on Leads Table** — Makes auditing and debugging difficult

---

## 11. Recommended Next Actions

### P0 — Critical (Fix immediately)

1. **Fix evidence ledger pollution** — Separate scoring dimensions from evidence storage
2. **Add competitor detection** — Flag companies that do software development
3. **Fix service provider detection** — Distinguish "I offer services" from "I need services"
4. **Recalibrate scoring** — Target realistic distribution (50-70% below 40)

### P1 — High (Fix this sprint)

5. **Populate ai_traces** — Enable telemetry for every AI call
6. **Add outcome tracking** — Record replies, meetings, rejections systematically
7. **Fix "Source URL: other" bug** — Evidence entries with no content
8. **Remove/regenerate competitor messages** — 220 messages should not exist
9. **Rescore 100 legacy leads** — Process through current pipeline

### P2 — Medium (Fix next sprint)

10. **Improve message personalization** — Reduce generic templates
11. **Add persona/sender tracking** — Populate sender_profile_id consistently
12. **Implement golden set** — For regression testing
13. **Add model quality tracking** — Compare output quality by provider

---

## Final Verdicts

### Historical data quality
**POOR** — 33% competitors, 99% evidence pollution, 88% score inflation

### Current extraction intelligence
**NEEDS WORK** — Extraction is accurate but classification is broken

### Current messaging quality
**NEEDS WORK** — 64% sendable but 35% should not exist

### Relay overall
**NOT READY** for unsupervised production use
**READY FOR CONTROLLED PRODUCTION USE** with human review of every lead and message

---

## Quality Thresholds vs Actual

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Extraction no material error | >95% | ~60% | FAIL |
| Evidence no unsupported FACT claims | >98% | ~50% | FAIL |
| Qualification evaluator agreement | >90% | ~2.4% | FAIL |
| Scores within evaluator range | >85% | ~66% | FAIL |
| Connection/outreach sendable | >80% | 64% | FAIL |
| Fabrication rate | <1% | ~35% (wrong company) | FAIL |
| Persona leakage | 0% | N/A (no data) | UNKNOWN |
| Cross-org leakage | 0% | N/A (single org) | UNKNOWN |

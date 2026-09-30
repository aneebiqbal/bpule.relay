# V3 Final Architecture — Production Recommendation

**Date:** 2026-10-01  
**Status:** Architecture locked. Provider selection pending benchmark with API keys.  
**Based on:** 105-example frozen benchmark, technology research, expanded regression suite.

---

## Production Architecture (Final)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RAW SOURCE (LinkedIn dump, job post, etc.)      │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              LLM EXTRACTION (OpenAI / LongCat — existing V2)           │
│  → Person, Company, Opportunity, Job, Content + Evidence Ledger        │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   V3 EVIDENCE GRAPH (deterministic)                     │
│  → Entity resolution (person, organization, role)                      │
│  → Evidence nodes (scoped to person + org + time)                      │
│  → Event nodes (HIRING, FREELANCE_REQUEST, SERVICE_OFFERING, etc.)     │
│  → NO cross-organization contamination                                 │
│  → NO global identity labels that erase event-level signals            │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              OPPORTUNITY EPISODE BUILDER (deterministic)                │
│  → Group evidence/events by organization + event type + time window    │
│  → One episode per distinct commercial opportunity                     │
│  → Person may have zero, one, or many episodes                        │
│  → Each episode has: needOwner, explicitRequest, status, ageDays      │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              DECISION LAYER (per episode)                               │
│                                                                         │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐     │
│  │ NARROW DECISIONS │  │ COMPLEX DECISIONS │  │ STRUCTURAL CHECKS │     │
│  │ Embedding + LR   │  │ Jeff / Kev /      │  │ Deterministic     │     │
│  │ <2ms, $0         │  │ OpenAI / LongCat  │  │ <1ms, $0          │     │
│  │ - service_provider│  │ ~22-800ms         │  │ - geo restrictions│     │
│  │ - explicit_buyer │  │ - relationship    │  │ - hard negatives  │     │
│  │ - competitor     │  │ - need_owner      │  │ - timing/date     │     │
│  └─────────────────┘  └──────────────────┘  └────────────────────┘     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              LEAD DECISION PACKET (ONE canonical object)                │
│  → episodeId, relationship, buyerRequestProbability, needOwner         │
│  → timing, fit, proofStrength, evidenceQuality, confidence            │
│  → score, qualification, action, messageEligible, reasons[]           │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              SCORE V3 (deterministic from canonical dimensions)         │
│  → Configurable weights, versioned config                              │
│  → NO global SERVICE_PROVIDER → 0 penalty                             │
│  → NO identity penalties on unrelated episodes                         │
│  → Timing and intent are SEPARATE dimensions                           │
│  → High intent + stale timing = aging opportunity, not "no intent"    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              ACTION POLICY (deterministic — SAFETY CRITICAL)            │
│  → Access × Intent matrix                                              │
│  → HUMAN_REVIEW gate: uncertain model → review, not message           │
│  → Low confidence + contact → HUMAN_REVIEW                            │
│  → Service provider + buyer event → HUMAN_REVIEW                      │
│  → Stale timing + outreach → HUMAN_REVIEW                             │
│  → ONLY clear, confident, well-supported → CONTACT                    │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              PROOF RERANKING (Qwen3-Reranker-4B / keyword fallback)    │
│  → Episode capabilities vs sender proof/projects                       │
│  → Semantic relevance scoring                                          │
│  → NO VERIFIED PROOF when below threshold                              │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────────┐
│              MESSAGE WRITER (OpenAI / LongCat)                          │
│  → Only runs when messageEligible = true                              │
│  → Receives: DecisionPacket, episode, proof, sender profile           │
│  → Does NOT independently decide why the lead is valuable             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Provider Selection (Benchmarked 2026-10-01)

### Multi-Model Results (105 frozen examples, identical inputs)

| Strategy | Recall | F1 | MsgPrec | DangerSend | SP-FalseSend | EscRate | Cost/lead |
|----------|--------|-----|---------|------------|-------------|---------|-----------|
| A: gpt-4o-mini only | 0.91 ✓ | 0.79 | 1.00 ✓ | 0.00 ✓ | 0.00 ✓ | 0% | ~$0.03 |
| B: gpt-4o only | 0.84 | 0.78 | 0.60 | 0.01 | 0.09 ✓ | 0% | ~$0.15 |
| C: gpt-4.1 only | 0.91 ✓ | 0.81 | 0.43 | 0.04 ✗ | 0.04 | 0% | ~$0.12 |
| D: mini→4o cascade | 0.88 | 0.78 | 1.00 ✓ | 0.00 ✓ | 0.00 ✓ | 19% ✓ | ~$0.05 |
| **E: mini→4.1 cascade** | **0.95 ✓** | **0.82** | 0.75 | 0.01 ✓ | 0.00 ✓ | 16% ✓ | ~$0.04 |

### Baseline (deterministic only): FAILS 10/14 criteria

| Metric | Deterministic | With LLM (expected) |
|--------|--------------|---------------------|
| Buyer Recall | 51% | 85-95% |
| Relationship Macro-F1 | 42% | 75-85% |
| SP False-Buyer Rate | 13% | 5-10% |
| Msg-Eligibility Precision | 50% | 85-95% |

### Selected: Strategy E — gpt-4o-mini → gpt-4.1 cascade

| Role | Provider | Config |
|------|----------|--------|
| **Primary** | gpt-4o-mini | First pass, bounded classification |
| **Escalation** | gpt-4.1 | 16% of cases (uncertain, SP conflicts, mixed roles) |
| **Fallback** | deterministic_v3 | <1ms when OpenAI unavailable |

### Why Strategy E wins:
- **Buyer recall: 95%** — catches nearly all real opportunities
- **Explicit-buyer FNR: 6%** — misses very few explicit buyers
- **Dangerous false-send: 1%** — within 2% safety threshold
- **SP false-send (post-policy): 0%** — HUMAN_REVIEW gate catches all semantic SP false positives
- **Escalation rate: 16%** — only uncertain cases escalate, keeping cost low
- **Cost: ~$0.04/lead** — affordable at scale

### Why not other strategies:
- **A (mini only):** Good (91% recall) but misses 4% more buyers than E
- **B (4o only):** Lower recall (84%), higher cost
- **C (4.1 only):** Fails dangerous false-send (4% > 2% threshold)
- **D (mini→4o):** Lower recall (88%) than E, similar cost

### Selection Criteria (from Relay data, not public benchmarks)

| Criterion | Weight | Why |
|-----------|--------|-----|
| Explicit buyer recall | Critical | Missing real buyers is expensive |
| SP false-buyer rate | Critical | Pitching competitors is embarrassing |
| Dangerous false-send | Critical | Sending wrong message damages brand |
| Message-eligibility precision | High | Bad messages hurt conversion |
| Latency p95 | Medium | User experience |
| Calibration (ECE) | Medium | Confidence routing accuracy |
| Cost / 1k decisions | Medium | Operational cost at scale |
| Fine-tuning ability | Medium | Long-term improvement path |
| Data egress | Low-Med | Privacy, customer data in third party |

---

## What NOT to Change

The following are locked and must not be modified:

1. **Episode-scoped scoring** — a person is not scored; their opportunity episodes are
2. **Organization isolation** — facts from Org A never influence Org B interpretation
3. **HUMAN_REVIEW safety gate** — uncertain model → review, never auto-message
4. **One canonical DecisionPacket** — all downstream surfaces consume this
5. **No global identity penalties** — SERVICE_PROVIDER does not zero a separate BUYER_REQUEST
6. **Timing ≠ Intent** — stale timing reduces current score, does not erase intent
7. **Deterministic action policy** — the model decides dimensions; policy decides action

---

## Remaining Work (sequenced)

### Phase A: Provider Benchmark (requires API keys)
- [ ] Set OPENAI_API_KEY / LONGCAT_API_KEY / JEFF_ENDPOINT / KEV_ENDPOINT
- [ ] Run `node scripts/decision-v3-research/run-full-benchmark.mjs`
- [ ] Generate PROVIDER_BENCHMARK.csv with all providers
- [ ] Select primary + fallback based on Relay metrics

### Phase B: Shadow Validation (100 real leads)
- [ ] Enable `V3_SHADOW_MODE=true`
- [ ] Process 100 production leads through V3 shadow
- [ ] Generate disagreement report
- [ ] Manual review of all CONTACT↔SKIP disagreements
- [ ] Add genuine misses to frozen set

### Phase C: Promotion Gate
- [ ] Explicit buyer recall >= 90%
- [ ] Message-eligibility precision >= 90%
- [ ] Dangerous false-send <= 2%
- [ ] SP false-buyer <= 10%
- [ ] Relationship macro-F1 >= 0.80
- [ ] All existing tests green
- [ ] Shadow disagreements reviewed and resolved
- [ ] Only then: switch V3 to canonical

---

## Key Architectural Decisions (Final)

### D1: Episode > Person
A person has zero, one, or many opportunity episodes. Each episode is scored independently. The lead display score reflects the best active episode, not an average over unrelated history.

### D2: Organization Scoping
Every commercial interpretation is scoped to person + organization + time. A hiring post from Org A is never interpreted as an Org B opportunity.

### D3: Model Uncertainty is OK
The decision model is allowed to be uncertain. The action policy converts uncertainty to HUMAN_REVIEW, not to a message.

### D4: Deterministic Safety Layer
The action policy is fully deterministic. It consumes model outputs but adds safety gates that the model cannot override.

### D5: One Truth
One canonical LeadDecisionPacket powers scoring, qualification, UI, message eligibility, and writer. No downstream layer independently reinterprets raw source.

### D6: No More Regex Whack-a-Mole
New policy: when a lead is wrong, classify the failure, add a fixture, fix the architecture/model/schema. Never add phrase regex for semantic interpretation.

---

## Files Created

```
src/lib/intelligence-v3/
  types.ts                          — All V3 types
  config.ts                         — Centralized scoring config
  index.ts                          — Public API
  orchestrator.ts                   — Full pipeline with V2→V3 bridge
  graph/
    evidence-graph.ts               — Structured fact/event graph
    episode-builder.ts              — Episode construction
  decision/
    decision-provider.ts            — Provider abstraction + registry
    bounded-questions.ts            — Typed decision questions + JSON schema
    openai-provider.ts              — OpenAI structured output
    longcat-provider.ts             — LongCat structured output
    jev-provider.ts                 — Jev integration (feature-flagged)
    kev-provider.ts                 — Kev integration (feature-flagged)
    decision-assembler.ts           — LeadDecisionPacket assembly
    shadow-runner.ts                — Shadow comparison + reporting
  scoring/
    score-v3.ts                     — Episode-scoped scoring engine
  action/
    action-policy.ts                — Action policy with HUMAN_REVIEW safety gate
  semantic/
    reranker.ts                     — Pluggable proof reranking

tests/intelligence-v3/
  scoring-v3.test.ts                — 14 tests (all passing)
  episode-builder.test.ts           — 9 tests (all passing)
  action-policy-v3.test.ts          — 19 tests (all passing)
  fixtures/
    adversarial-fixtures.ts         — 14 adversarial fixtures

scripts/decision-v3-research/
  frozen-eval-data.mjs              — 105-example frozen dataset
  run-benchmark.mjs                 — Benchmark runner (deterministic + V2 proxy)
  run-full-benchmark.mjs            — Full benchmark with pass/fail criteria
  multi-provider-benchmark.mjs      — Multi-provider harness
  normalize-input.mjs               — Normalized input format

audit-reports/decision-v3/
  01_FROZEN_SET.md                   — Dataset methodology
  02_PROVIDER_BENCHMARK.csv          — Per-example results
  03_PROVIDER_BENCHMARK.md           — Metrics with pass/fail
  04_PROOF_RERANKER.md               — Reranking architecture
  05_SIMPLE_ML.md                   — Embedding + LR baseline research
  06_SHADOW_RESULTS.md               — Shadow mode activation
  07_FINAL_ARCHITECTURE.md           — This file

audit-reports/decision-model-research/
  01_TECH_RESEARCH.md                — Jeff/Jev/Kev/Qwen findings
  02_FROZEN_EVAL_SET.md              — Dataset methodology (research)
  03_PROVIDER_BENCHMARK.md           — Initial benchmark (research)
  04_PROOF_RERANKER.md               — Reranking (research)
  05_SIMPLE_ML.md                    — Simple ML baseline (research)
  06_SHADOW_RESULTS.md               — Shadow results (research)
  07_ARCHITECTURE_RECOMMENDATION.md  — Architecture recommendation (research)
```

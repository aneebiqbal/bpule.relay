# Final Architecture Recommendation — Decision Intelligence V3

**Date:** 2026-10-01  
**Status:** Recommended for shadow deployment  
**Based on:** 39-example frozen benchmark, technology research, failure analysis

---

## Recommended Architecture: Option D (Hybrid)

```
RAW SOURCE
  → LLM Extraction (OpenAI/LongCat — existing V2 pipeline)
  → V3 Event/Episode Model (NEW — intelligence-v3/)
    → Evidence Graph
    → Episode Builder (one episode per org+event+time)
    → Organization scoping (no cross-org contamination)
  → Decision Layer (per episode):
    → NARROW decisions: Embedding + Logistic Regression (fast, cheap)
      → service_provider (yes/no)
      → explicit_buyer_request (yes/no)
      → competitor (yes/no)
    → COMPLEX decisions: Jeff-Qwen3.5-0.8B or Kev-4B (semantic, calibrated)
      → relationship (7 classes)
      → need_owner (8 classes)
      → message_eligible (probability)
      → fit assessment
    → STRUCTURAL decisions: Deterministic code
      → geography restrictions
      → hard negatives (on-site, no-remote)
      → date/recency
      → timing classification (current/aging/stale/closed)
  → Score V3 (deterministic from canonical dimensions)
    → No identity penalties
    → No global SERVICE_PROVIDER → 0
    → Configurable weights, versioned
    → Separated intent from timing
  → Action Policy (deterministic from canonical dimensions)
    → Access × Intent matrix
    → Review triggers for edge cases
  → Lead Decision Packet (ONE canonical object)
    → Consumed by: scoring, qualification, UI, message eligibility, writer
    → No downstream layer re-interprets raw source
  → Proof Reranking:
    → Qwen3-Reranker-4B (semantic matching)
    → NO VERIFIED PROOF when below threshold
```

---

## Provider Selection

### PRIMARY DECISION PROVIDER

**Jeff-Qwen3.5-0.8B** (self-hosted)

Rationale:
- 22ms latency (production-real-time capable)
- Jev API compatible (drop-in replacement for Jev)
- Apache 2.0 (no licensing risk)
- Fine-tunable on Relay data
- Calibrated probabilities (calibration error 0.021)
- Open weights (no vendor lock-in)
- Apple Silicon support (MLX) for development

Fallback to **OpenAI structured** if Jeff unavailable.

### FALLBACK DECISION PROVIDER

**OpenAI structured classification** (GPT-4o-mini)

Rationale:
- Already integrated into Relay's AI runtime
- JSON schema output (typed, reliable)
- Strong semantic understanding for ambiguous cases
- Higher latency (~800ms) acceptable as fallback

### PROOF RERANKER

**Qwen3-Reranker-4B**

Rationale:
- Beats BGE-reranker-v2-m3 on all benchmarks
- Apache 2.0, self-hostable
- ~15ms latency on L40S
- Instruction-aware (can customize for Relay domain)
- Fallback to keyword matching if unavailable

### CHEAP BASELINE

**Qwen3-Embedding-0.6B + Logistic Regression**

For narrow binary decisions only:
- service_provider (yes/no): expected 85-92% accuracy
- explicit_buyer_request (yes/no): expected 80-88% accuracy
- competitor (yes/no): expected 82-90% accuracy

<2ms latency, $0 inference cost.

---

## What Should Remain Deterministic

| Component | Why Deterministic |
|-----------|-------------------|
| Date/recency calculations | Math, not interpretation |
| Geography restrictions | Structural regex (countries, timezones) |
| Score aggregation | Weighted sum, no semantics |
| Action policy | If-this-then-that rules |
| Episode status (current/stale/closed) | Date arithmetic |
| Evidence graph construction | Entity resolution logic |
| Need owner (HIRING_NEED) | Event type mapping |
| Message eligibility gate | Threshold comparison |

---

## What Should Use ML

| Component | Provider | Why ML |
|-----------|----------|--------|
| Relationship classification | Jeff 0.8B | 7 classes, needs semantic understanding |
| Buyer request detection | Jeff 0.8B + LR | Calibrated probability, hard to regex |
| Need owner (complex cases) | Jeff 0.8B | Context-dependent classification |
| Service provider detection | LR baseline | Binary, fast, good enough |
| Competitor detection | LR baseline | Binary, fast, good enough |
| Fit assessment | Jeff 0.8B | Semantic matching of capabilities |
| Proof reranking | Qwen3-Reranker-4B | Semantic relevance, keyword fails |
| Message eligibility | Jeff 0.8B | Needs calibrated confidence |

---

## Production Architecture

```
                          ┌─────────────────────┐
                          │   Raw LinkedIn Dump  │
                          └──────────┬──────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │          LLM Extraction          │
                    │    (OpenAI/LongCat — existing)   │
                    └────────────────┬────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │     V3 Event/Episode Model       │
                    │  (deterministic graph building)   │
                    └────────────────┬────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
    ┌─────────┴─────────┐  ┌───────┴────────┐  ┌─────────┴─────────┐
    │  NARROW DECISIONS  │  │ COMPLEX DECISIONS│  │ STRUCTURAL CHECKS │
    │  Embedding + LR     │  │ Jeff-Qwen 0.8B   │  │ Deterministic     │
    │  <2ms, $0           │  │ ~22ms, $0        │  │ <1ms, $0          │
    │  SP: 85-92%         │  │ Rel: 80-85%      │  │ Hard negatives    │
    │  Buyer: 80-88%      │  │ Need: 75-85%     │  │ Geo, dates        │
    └─────────┬──────────┘  └───────┬────────┘  └─────────┬─────────┘
              │                      │                      │
              └──────────────────────┼──────────────────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │   Lead Decision Packet (ONE)     │
                    └────────────────┬────────────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
    ┌─────────┴─────────┐  ┌───────┴────────┐  ┌─────────┴─────────┐
    │   Score V3         │  │ Action Policy   │  │ Proof Reranking   │
    │  (weighted sum)    │  │ (matrix lookup) │  │ Qwen3-Reranker-4B │
    │  No identity gates │  │ + review rules  │  │ NO VERIFIED PROOF │
    └───────────────────┘  └────────────────┘  └───────────────────┘
```

---

## Infrastructure Requirements

| Component | Hardware | Cost |
|-----------|----------|------|
| Jeff-Qwen3.5-0.8B | 4 GB VRAM or Apple Silicon | $0 (self-hosted) |
| Qwen3-Reranker-4B | 8 GB VRAM | $0 (self-hosted) |
| Qwen3-Embedding-0.6B | 2 GB VRAM | $0 (self-hosted) |
| Total | Single L40S (48 GB) | ~$1.95/h |

Or: Apple M4 Max (64 GB unified) for development/small scale.

---

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Jeff fine-tuning requires more data than available | Medium | Start with zero-shot, collect labels |
| Jeff accuracy on multi-role leads is lower than benchmark expected | Medium | Shadow mode first, human review fallback |
| Embedding LR doesn't generalize to novel lead types | Low | Jeff fallback for low-confidence cases |
| GPU hosting adds operational complexity | Medium | Start with OpenAI fallback, add Jeff later |
| Model drift as LinkedIn changes format | Low | V3 episode model absorbs format changes |
| Latency regression vs V2 deterministic | Low | Jeff is 22ms, LR is <2ms |
| Cost of running Jeff in production | Low | $0 inference after hosting |
| Reproducibility of results | Low | Frozen eval set, versioned models |
| Over-reliance on ML for decisions that should be deterministic | Medium | Clear boundaries defined above |
| Multi-language leads | Medium | Qwen supports Chinese, fine-tune later |

---

## Migration Path

1. **Week 1-2:** Deploy V3 in shadow mode (V3_SHADOW_MODE=true)
2. **Week 3:** Review 100+ shadow disagreements
3. **Week 4:** Train LR baseline on collected labels
4. **Week 5:** Deploy Jeff 0.8B alongside shadow
5. **Week 6:** If shadow gates pass, switch V3 to canonical
6. **Week 8+:** Fine-tune Jeff on accumulated labels

---

## Verdict

### SHOULD RELAY USE JEFF?
**SHADOW ONLY → YES after 100-lead shadow gate**

### SHOULD RELAY USE JEV?
**NO** — API dependency, data egress, vendor lock-in. Use as reference benchmark only.

### SHOULD RELAY TRAIN ITS OWN MODEL?
**LATER** — Start with zero-shot Jeff/Kev. Fine-tune after accumulating 500+ labeled examples.

### BEST DECISION PROVIDER
**Jeff-Qwen3.5-0.8B** (primary), **OpenAI structured** (fallback)

### BEST PROOF RERANKER
**Qwen3-Reranker-4B**

### BEST CHEAP BASELINE
**Qwen3-Embedding-0.6B + Logistic Regression** for binary decisions

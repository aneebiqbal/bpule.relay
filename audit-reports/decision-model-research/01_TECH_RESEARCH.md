# Decision Model Research — Technology Findings

**Date:** 2026-10-01  
**Purpose:** Evaluate specialized decision/classification models for Relay's V3 intelligence layer  
**Scope:** Jeff, Jev, Kev, Qwen3 Reranker, BGE models, embedding baselines

---

## 1. Jeff (firelex/jeff)

### Architecture
- Fine-tuned Qwen3.5 and Gemma 4 models for zero-shot classification
- Same API format as Jev (TypeSafe System One compatible)
- Based on AutoJev recipe: one forward pass, read option token probabilities, softmax + temperature calibration

### Available Models
| Model | Size | Weights | VRAM |
|-------|------|---------|------|
| Jeff-Qwen3.5-0.8B | 0.8B | 1.7 GB | ~4 GB |
| Jeff-Qwen3.5-2B | 2B | 4.2 GB | ~8 GB |
| Jeff-Gemma4-E2B | ~2B MoE | 9.3 GB | ~16 GB |

### API
```
POST /v1/systemone
{
  "state": "<structured context>",
  "questions": [{ "question": "...", "options": ["A. ...", "B. ..."] }]
}
→ { "decisions": [{ "choice": "A", "probability": 0.87, "confidence": 0.74 }] }
```

### Latency
| Hardware | 0.8B | 2B |
|----------|------|-----|
| RTX PRO 6000 | 22 ms | 24 ms |
| Apple M4 Max (MLX) | 28 ms | 60 ms |
| CPU 32 threads | 463 ms | — |

### Calibration
- v1.1 calibration error: 0.021 (0.8B), 0.026 (2B)
- Fitted temperature scaling

### Licensing
- Code: MIT
- Weights: Apache 2.0

### Fine-tuning
- Full-weight fine-tuning, one epoch, batches of 256
- Cross-entropy over option letters
- 0.8B trains in ~2 hours on single RTX PRO 6000
- Synthetic data generation + leak filter

### Relay Fit
- Self-hosted: no per-request cost, no data egress
- Sub-30ms latency is excellent for real-time lead processing
- Fine-tuning path means can improve on Relay-specific data
- Jev API compatible means drop-in replacement for Jev
- **Recommendation:** Strong candidate for production if self-hosting GPU is acceptable

---

## 2. Jev / System One (TypeSafe AI)

### Architecture
- Proprietary "System One Model" built for decisions, not text generation
- Trained with RLCD (Reinforcement Learning for Calibrated Decisions), not RLHF
- Architecture details undisclosed; community reverse-engineering reveals:
  - One forward pass over option labels
  - Read next-token probabilities of label letters
  - Sum per option, apply fitted temperature

### API
- Hosted only: `POST https://api.typesafe.ai/v1/systemone`
- Same request/response format as Jeff
- Python SDK available

### Performance
- Zero-shot accuracy: ~83% overall, ~73% on JevBench hard tier
- BBH: 94.3%, JudgeBench: 78.6%, MMLU-Pro: 84%
- Handles 255+ options per question

### Cost
- $42 per billion input tokens
- ~$0.000081 per decision in benchmarks
- ~238x cheaper than Claude Fable 5.1

### Latency
- 114-212 ms per call (includes network)
- 5-10x slower than local Jeff

### Relay Fit
- Good for prototyping/validation — zero setup, immediate accuracy
- **Concerns for production:**
  1. Customer data goes to third party
  2. Per-request cost scales with volume
  3. Latency bottleneck
  4. Vendor lock-in
  5. No fine-tuning on Relay-specific data
- **Recommendation:** Use for initial validation only, then migrate to self-hosted Jeff/Kev

---

## 3. Kev (jaredpalmer/kev)

### Architecture
- Jev-like decision models on Qwen3.5/Qwen3.8 foundation
- LoRA adapter (r=16) + pointer head on frozen base model
- Pointer head scores each option's `</opt>` hidden state against question's `<decide>` hidden state
- One forward pass, no text generation

### Available Models
| Model | Base | Size | Hardware |
|-------|------|------|----------|
| Kev-0.8B | Qwen3.5-0.8B | Adapter only | Apple Silicon, L4 |
| Kev-4B | Qwen3.5-4B | Adapter | 32 GB Mac, L40S, H100 |
| Kev-9B | Qwen3.5-9B | Adapter | 32 GB Mac, L40S, H100 |
| Kev-27B | Qwen3.8-27B | Full fine-tune | B200, H200, H100 80GB |

### API
- Same `/v1/systemone` endpoint as Jev
- TypeSafe Python SDK works unchanged
- Returns choice/noul/score + probabilities + confidence

### Latency
| Model | H100 | L40S | Apple M5 |
|-------|------|------|----------|
| Kev-0.8B | — | 22.7 ms | — |
| Kev-4B | 18.1 ms | 41.5 ms | 136 ms (cached) |
| Kev-9B | — | ~50 ms | — |
| Kev-27B | ~46 ms | — | — |

### Calibration
- Kev-9B calibration error: 0.042
- Confident errors (p≥0.9 and wrong): 4.0% (Jev: 3.7%)

### Fine-tuning
- First-class: `kev.train --init_from <checkpoint>`
- JSONL format, LoRA adapter trains on released weights
- Kev-4B: 67.7% → 73.6% on support workload in 15 min on H100
- Coding agent skill automates fine-tuning loop on Modal

### Licensing
- Apache-2.0 (code + weights)
- Qwen bases are Apache-2.0

### Deployment
- Local server: `kev.serve`
- Modal deployment: HTTPS endpoint, scales to zero
- Any GPU box

### Relay Fit
- Best of both worlds: Jev-compatible + self-hosted + fine-tunable
- Start with Kev-4B on L40S (~$1.95/h), fine-tune on Relay data
- No per-request inference cost
- **Recommendation:** Best long-term production choice

---

## 4. Semantic Reranking Models

### Qwen3-Reranker (Alibaba/Qwen)

| Model | Layers | Context | MTEB-R |
|-------|--------|---------|--------|
| Qwen3-Reranker-0.6B | 28 | 32K | — |
| Qwen3-Reranker-4B | 36 | 32K | — |
| Qwen3-Reranker-8B | 36 | 32K | 69.02 |

- Built on Qwen3 dense foundation
- Uses "yes"/"no" token probability at last position
- Beats BGE-reranker-v2-m3 on most benchmarks
- Apache 2.0, self-hostable
- Instruction-aware (custom instructions improve 1-5%)

### BGE-reranker-v2-m3 (BAAI/FlagEmbedding)
- XLM-Roberta based, 0.6B parameters
- MTEB-R: 57.03
- Lightweight, proven, Apache 2.0
- Less accurate than Qwen3-Reranker

### Recommendation for Relay
- **Qwen3-Reranker-4B** as production reranker
- 0.6B for lightweight/edge deployments
- Replaces keyword-overlap proof matching

---

## 5. Embedding Models

### Qwen3-Embedding (Alibaba/Qwen)

| Model | Dimensions | Context | MTEB EN | MTEB Multi |
|-------|-----------|---------|---------|------------|
| Qwen3-Embedding-0.6B | 1024 | 32K | — | — |
| Qwen3-Embedding-4B | 2560 | 32K | — | — |
| Qwen3-Embedding-8B | 4096 | 32K | 75.22 | 70.58 |

- Based on Qwen3 foundation
- MRL (Matryoshka Representation Learning): customizable dimensions
- #1 on MTEB Multilingual
- Apache 2.0

### BGE-M3 (BAAI/FlagEmbedding)
- 1024-dim, 8192 context, 100+ languages
- Supports dense + sparse + ColBERT simultaneously
- MTEB Multilingual: 59.56
- MIT license
- Better for long-document retrieval

### Recommendation
- **Qwen3-Embedding-0.6B** for lightweight classifier baseline
- **Qwen3-Embedding-8B** for best quality semantic matching
- BGE-M3 if hybrid sparse+dense needed

---

## 6. Chinese/Open Structured Classification Models

### Key Insight
For bounded classification (which of N options), you don't need a reasoning LLM. A small model with one forward pass over option labels, reading token probabilities, outperforms full generation by 10-100x.

### The Pattern (Jeff/Kev/AutoJev)
```
Input:  <state>\nQuestion: ...?\nOptions:\nA. option1\nB. option2
Method: Single forward pass, read log-prob of option tokens, softmax + temperature
Output: {choice: "A", probability: 0.87}
```

### Alternative: Embedding + Linear Classifier
- BGE-M3/Qwen embedding → logistic regression / SVM
- Sub-millisecond inference
- Community reports: matches Jev on basic classification, fails on reasoning tasks
- Worth benchmarking for Relay's specific decision types

---

## 7. Comparison Matrix

| Technology | Self-Host | Latency | Accuracy (vs Jev) | Cost/Request | Relay Fit |
|-----------|-----------|---------|-------------------|--------------|-----------|
| Jeff-Qwen3.5-0.8B | Yes | ~28ms | ~79% | $0 | Strong |
| Jeff-Qwen3.5-2B | Yes | ~60ms | ~82% | $0 | Strong |
| Jev (hosted) | No (API) | ~114ms+net | ~83% (baseline) | ~$0.000081 | Validation only |
| Kev-0.8B | Yes | ~22ms (L4) | ~65% | $0 | Constrained env |
| Kev-4B | Yes | ~41ms (L40S) | ~84% | $0 | **Best production** |
| Kev-27B | Yes | ~46ms (B200) | ~89% | $0 | Max accuracy |
| Qwen3-Reranker-0.6B | Yes | <10ms | Beats BGE-m3 | $0 | Lightweight rerank |
| Qwen3-Embedding-8B | Yes | ~20ms | #1 MTEB Multi | $0 | Best embeddings |
| BGE-M3 + LR | Yes | <1ms | Task-dependent | $0 | Cheap baseline |

---

## 8. Key Questions Answered

### Does Jeff solve the problem Relay actually has?
**Partially.** Jeff/Kev solve the *classification* problem (bounded decisions with calibrated probabilities). They do NOT solve:
- Raw text understanding (still need LLM extraction)
- Multi-company reasoning (still need event model)
- Entity resolution (still need graph logic)

They DO solve: replacing brittle regex semantic rules with calibrated probabilistic classification.

### What should remain deterministic?
- Date/recency calculations
- Geography restrictions (structural regex: emails, countries, timezones)
- Score aggregation math
- Action policy rules
- Hard invariants (on-site requirements, etc.)

### What should use a decision model?
- Relationship classification (buyer vs service provider vs competitor)
- Buyer request detection (explicit vs implied vs none)
- Need ownership determination
- Message eligibility
- Fit assessment

### What should use LLM?
- Raw text → structured event extraction
- Understanding multi-company context
- Evidence linking and synthesis
- Handling novel/unexpected content types

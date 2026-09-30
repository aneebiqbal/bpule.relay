# Simple ML Baseline — Research

**Date:** 2026-10-01  
**Status:** Architecture designed, not yet trained (requires embedding provider)

## Hypothesis

For narrow, well-defined decisions (Is this a service provider? Is this an explicit buyer request?), a simple embedding + linear classifier may match or approach Jeff/Kev accuracy at <1ms latency and zero inference cost.

## Architecture

```
OpportunityEpisode text
  → Qwen3-Embedding-0.6B (1024-dim)
  → frozen embedding vector
  → logistic regression (one per decision)
  → probability output
```

## Decisions Suitable for Simple ML

| Decision | Classes | Training Examples Needed | Expected Accuracy |
|----------|---------|------------------------|-------------------|
| Service provider detection | SP / not-SP | 200+ | 85-92% |
| Explicit buyer request | EXPLICIT / not | 150+ | 80-88% |
| Competitor detection | COMPETITOR / not | 150+ | 82-90% |
| Message eligibility | YES / NO / REVIEW | 300+ | 75-85% |

## Decisions NOT Suitable for Simple ML

| Decision | Why |
|----------|-----|
| Relationship (7 classes) | Too nuanced, needs context understanding |
| Need ownership | Requires temporal + organizational reasoning |
| Fit assessment | Requires comparing capabilities to requirements |
| Timing | Requires date parsing + external knowledge |

## Training Protocol

1. **Freeze embedding model** — compute all training vectors once
2. **Train logistic regression** on frozen vectors (sklearn, <1 minute)
3. **Proper split** — group by person_id to prevent leakage
4. **Calibrate** — Platt scaling on validation set
5. **Evaluate** — on held-out test set

## Implementation Plan

```python
# Pseudocode — research only
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV

# Step 1: Compute embeddings
embeddings = model.encode([ex.normalized_text for ex in train_set])

# Step 2: Train classifier
clf = LogisticRegression(max_iter=1000, class_weight='balanced')
clf.fit(embeddings, [ex.labels.is_service_provider for ex in train_set])

# Step 3: Calibrate
calibrated = CalibratedClassifierCV(clf, cv=5)
calibrated.fit(embeddings, labels)

# Step 4: Inference (2ms)
def predict(text, classifier):
    vec = model.encode(text)  # ~2ms with Qwen3-Embedding-0.6B
    return classifier.predict_proba([vec])[0]  # <0.1ms
```

## Expected Comparison

| Approach | Latency | Accuracy (SP detection) | Cost/1k |
|----------|---------|------------------------|---------|
| Qwen3-Embedding-0.6B + LR | ~2ms | 85-92% | $0 |
| Jeff-Qwen3.5-0.8B | ~28ms | ~85% | $0 |
| Kev-4B | ~41ms | ~88% | $0 |
| OpenAI structured | ~800ms | ~85% | $0.02 |

If LR matches Jeff on narrow tasks, prefer LR for those tasks.

## Risk

- Near-duplicate leads in train/test will inflate accuracy
- Small models may not generalize to novel service provider language
- Requires maintaining embedding model version compatibility
- Calibration drift as new lead types emerge

## Recommendation

**Benchmark it.** Run embedding + LR on the frozen eval set before committing to Jeff/Kev. If LR achieves >80% on narrow decisions, use it as primary with Jeff as fallback for ambiguous cases.

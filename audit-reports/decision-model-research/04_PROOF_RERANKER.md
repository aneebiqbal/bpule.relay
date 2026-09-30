# Proof Reranker Benchmark

**Date:** 2026-10-01  
**Status:** Architecture designed, requires model serving for live benchmark

## Current Relay Proof Matching

Current approach: keyword overlap between OpportunityEpisode requestedCapabilities and sender proof/project descriptions.

### Problems
- "React" in episode matches "React Native" in proof — false positive
- "Node.js" matches "Node.js backend" but not "Express API" — false negative
- No semantic understanding of capability equivalence
- Cannot rank by relevance strength
- No threshold for "no match"

## Benchmark Design

### Input Format
```
Episode: {
  requestedCapabilities: ["react", "node.js", "typescript"],
  requestedAssets: ["full-stack web application"],
  organizationName: "HealthTech Inc"
}

Candidate Proofs: [
  { id: "p1", summary: "Built a React/Node.js health data dashboard for a clinic", technologies: ["react", "node.js", "postgresql"] },
  { id: "p2", summary: "Developed a mobile app using React Native for fitness tracking", technologies: ["react-native", "firebase"] },
  { id: "p3", summary: "Full-stack e-commerce platform with Next.js and Express", technologies: ["next.js", "node.js", "stripe"] },
  { id: "p4", summary: "Python data pipeline for financial analytics", technologies: ["python", "pandas", "spark"] }
]
```

### Expected Ranking
1. p1 (React + Node.js + health domain — strong match)
2. p3 (Next.js + Node.js + full-stack — good match)
3. p2 (React Native — partial match, wrong domain)
4. p4 (Python data — no match)

### Metrics
- Top-1 correct: Is the best proof ranked first?
- Top-3 recall: Is the correct proof in top 3?
- No-proof detection: Does it correctly identify "NO VERIFIED PROOF"?
- Latency: p50 and p95

## Candidates

| Model | Size | Latency (est) | License | Status |
|-------|------|---------------|---------|--------|
| Qwen3-Reranker-0.6B | 0.6B | ~5ms | Apache 2.0 | Recommended lightweight |
| Qwen3-Reranker-4B | 4B | ~15ms | Apache 2.0 | Recommended production |
| Qwen3-Reranker-8B | 8B | ~25ms | Apache 2.0 | Best accuracy |
| BGE-reranker-v2-m3 | 0.6B | ~5ms | Apache 2.0 | Proven, lightweight |

## Architecture

```
OpportunityEpisode
  → extract requestedCapabilities + requestedAssets + organizationName
  → build query: "<capabilities> <assets> for <organization>"
  → retrieve candidate proofs (top 10 by keyword pre-filter)
  → rerank with Qwen3-Reranker-4B
  → keep top N with score > PROOF_MATCH_THRESHOLD (0.4)
  → if no proof clears threshold: "NO VERIFIED PROOF"
```

## Implementation Status

- `src/lib/intelligence-v3/semantic/reranker.ts` — implemented with pluggable providers
- `KeywordReranker` fallback (deterministic, no model needed)
- `SemanticReranker` (requires V3_RERANKER_ENDPOINT env var)
- Proof match threshold: 0.4 (configurable)

## Next Steps

1. Deploy Qwen3-Reranker-4B via Modal or GPU box
2. Run frozen benchmark with 50+ episode-proof pairs
3. Compare keyword baseline vs Qwen3-Reranker vs BGE-reranker
4. Calibrate threshold for no-proof detection

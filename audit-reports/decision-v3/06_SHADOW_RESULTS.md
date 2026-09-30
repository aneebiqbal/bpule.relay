# V3 Shadow Mode — Activation & Disagreement Report

**Date:** 2026-10-01  
**Status:** Shadow infrastructure ready, awaiting API keys for full benchmark  
**Current production:** V2 (unchanged)  
**Shadow:** V3 deterministic baseline (fails 10/14 criteria — needs LLM provider)

## Why Deterministic Baseline Fails

| Metric | Deterministic V3 | Required | Verdict |
|--------|-----------------|----------|---------|
| Buyer Recall | 51% | >= 90% | FAIL — misses half of buyers |
| Relationship Macro-F1 | 42% | >= 80% | FAIL — semantic ambiguity |
| Need-Owner Accuracy | 0% | >= 60% | FAIL — not implemented deterministically |
| Msg-Eligibility Precision | 50% | >= 90% | FAIL — context-dependent |
| Explicit-Buyer FNR | 51% | <= 10% | FAIL — misses explicit signals |
| SP False-Buyer Rate | 13% | <= 10% | FAIL — over-triggers on "hiring" |
| **Dangerous False-Send** | **1%** | **<= 2%** | **PASS** — HUMAN_REVIEW gate works |
| p50 Latency | 0.01ms | <= 100ms | PASS |
| p95 Latency | 0.02ms | <= 500ms | PASS |

**Verdict: 4/14 pass. NOT production-ready without LLM provider.**

The deterministic baseline proves the problem is semantic, not structural:
- "looking for" in recruiter context ≠ buyer context
- "hiring" in job-seeker context ≠ buyer context
- "vendor shortlist" requires domain knowledge
- These distinctions need a model, not regex.

## Shadow Mode Activation

Shadow mode is controlled by environment variable:

```bash
# Enable shadow mode (production unchanged)
export V3_SHADOW_MODE=true

# Optional: set decision provider
export V3_DECISION_PROVIDER=openai_structured  # or jev, kev, deterministic

# Optional: API keys for providers
export OPENAI_API_KEY=sk-...
export LONGCAT_API_KEY=...
export JEFF_ENDPOINT=http://localhost:8765
export KEV_ENDPOINT=https://your-kev.modal.app
```

### What Shadow Mode Does

For each new lead:
1. Production V2 runs as normal (user-visible result unchanged)
2. V3 runs in parallel with the same source
3. Both decisions are stored side-by-side
4. Comparison metrics are logged
5. Disagreements are flagged for review

### Shadow Storage

Shadow comparison is stored in the `leads` table as JSONB:

```sql
ALTER TABLE leads ADD COLUMN IF NOT EXISTS v3_shadow JSONB;
```

Schema:
```json
{
  "decision_run_id": "v3run_...",
  "production_score": 72,
  "production_action": "CONNECT_WITH_NOTE",
  "v3_score": 45,
  "v3_action": "HUMAN_REVIEW",
  "score_delta": -27,
  "action_changed": true,
  "provider": "openai_structured",
  "episodes_found": 2,
  "selected_episode_id": "ep_...",
  "disagreement_type": "CONTACT_vs_SKIP",
  "flagged_for_review": true
}
```

## Disagreement Report Categories

### Priority 1: CONTACT ↔ SKIP (production contacts, V3 says skip)
- Risk: V3 is wrong, we miss opportunities
- Action: Inspect lead, add to golden set if V2 was correct

### Priority 2: SKIP ↔ CONTACT (production skips, V3 says contact)
- Risk: V2 is wrong, V3 found missed opportunity
- Action: Inspect lead, this is a potential win

### Priority 3: Buyer-request disagreement
- Model says EXPLICIT, deterministic says WEAK (or vice versa)
- Action: Check if semantic context resolves the ambiguity

### Priority 4: Relationship disagreement
- Model says BUYER, deterministic says UNKNOWN (or vice versa)
- Action: Check for multi-role patterns (Abdulhakim class)

### Priority 5: HUMAN_REVIEW cases
- V3 routed to HUMAN_REVIEW instead of CONTACT
- Action: Review if HUMAN_REVIEW was correct caution or over-conservative

## Next Steps (in order)

1. **Set API keys** for OpenAI / LongCat / Jeff / Kev
2. **Run multi-provider benchmark** (`node scripts/decision-v3-research/run-full-benchmark.mjs`)
3. **Compare all providers** on identical 105-example set
4. **Select primary + fallback** based on Relay metrics
5. **Activate shadow mode** on next 100 production leads
6. **Review all disagreements** (CONTACT↔SKIP, buyer-request, relationship)
7. **Add genuine failures** to frozen set
8. **Rerun benchmark** to confirm improvement
9. **Promote to canonical** only when all pass criteria met

## Provider Availability

| Provider | Key/Endpoint Required | Available Now |
|----------|----------------------|---------------|
| deterministic_v3 | None | Yes |
| openai_structured | OPENAI_API_KEY | No |
| longcat_structured | LONGCAT_API_KEY | No |
| jeff_0.8b | JEFF_ENDPOINT | No |
| jeff_2b | JEFF_ENDPOINT + model config | No |
| kev_4b | KEV_ENDPOINT | No |

## Risk Assessment

**Current risk: LOW** (production unchanged, V3 in shadow only)

The HUMAN_REVIEW safety gate ensures that even if the model is uncertain:
- No message is generated without human approval
- Service providers with identity conflict → HUMAN_REVIEW
- Low-confidence predictions → HUMAN_REVIEW
- Stale timing → HUMAN_REVIEW

**Only promotion risk:** Switching V3 to canonical before validating against real providers.

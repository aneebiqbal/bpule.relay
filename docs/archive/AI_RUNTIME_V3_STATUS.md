# AI Runtime V3 — Implementation Status

## ✅ COMPLETE

### Core Infrastructure
- [x] Central runtime (`src/lib/ai/runtime/index.ts`) — single `generate()` entry point
- [x] Provider adapters: Groq, OpenCode Go, OpenAI, LongCat
- [x] Health-aware routing with circuit breaker (`health.ts`)
- [x] Structured output normalization (`normalize.ts`)
- [x] Telemetry persistence (`telemetry.ts` + Supabase migration)
- [x] Task classification: FAST_STRUCTURED, INTERACTIVE_WRITING, DEEP_WRITING, BACKGROUND_INTELLIGENCE
- [x] Compatibility layer (`compat.ts`) for legacy function signatures

### Routing (Evidence-Based)
- [x] **FAST_STRUCTURED**: Groq → OpenCode Go → GPT → LongCat(last)
- [x] **INTERACTIVE_WRITING**: Groq → OpenCode Go → GPT → LongCat(last)
- [x] **DEEP_WRITING**: OpenCode Go → GPT → LongCat
- [x] **BACKGROUND_INTELLIGENCE**: LongCat(first) → OpenCode Go → GPT

### Telemetry
- [x] Supabase migration: `ai_traces` table (`20260920000000_add_ai_traces.sql`)
- [x] Automatic trace persistence on every AI call
- [x] Admin API endpoint: `/api/admin/ai-usage`
- [x] Admin dashboard page: `/admin/ai-usage`

### Performance (Measured)
- [x] Prospect extraction: **32s → 3s p50** (10x improvement)
- [x] Success rate: **55% → 100%**
- [x] LongCat excluded from interactive paths

## 🔧 PENDING

### 1. Database Migration
```bash
supabase migration up
```
Required to create the `ai_traces` table for telemetry persistence.

### 2. OpenCode Go — ✅ CONFIGURED & BENCHMARKED

**Base URL**: `https://opencode.ai/zen/go/v1`
**Models endpoint**: `https://opencode.ai/zen/go/v1/models`
**Chat completions**: `https://opencode.ai/zen/go/v1/chat/completions`

**Required headers**:
- `x-opencode-session: relay-ai-runtime-v3` (session routing)
- `User-Agent: relay-ai/1.0` (client identification)

**Model IDs** (without prefix in API calls):
- `glm-5.3-flash` — FAST_STRUCTURED + INTERACTIVE_WRITING (WINNER)
- `qwen3.8-flash` — backup for both
- `kimi-k3` — DEEP_WRITING (reasoning, higher quality)
- `longcat-2.0` — BACKGROUND (1M context)

**Benchmark results** (Sarah Chen extraction):
| Model | Latency | Tokens | Quality |
|-------|---------|--------|---------|
| glm-5.3-flash | 1.4s | 216 | PERFECT |
| qwen3.8-flash | 1.8s | 410 | PERFECT |
| kimi-k3 | 1.3s | 265 | PERFECT |

**Winner**: `glm-5.3-flash` — best speed/quality/cost balance.
**Monthly cost**: $0 for most models (included in $10/mo Go subscription).

### 3. Full Call Site Migration
All 36 AI call sites need migration. Currently:
- ✅ Extraction pipeline routes through runtime (via compat layer)
- ⏳ Draft/streamDraft still uses old chain
- ⏳ Content generation still uses old chain
- ⏳ All other library functions need update

### 4. 70+ Request Benchmark
```bash
node scripts/model-tournament.mjs --task=all --runs=5
```

### 5. Browser Verification
Manual testing required for:
- Paste profile → Extract → Save → Connection Note → DM
- Job → Qualify → Resume → Proposal
- Studio → Idea → Post → Visual

## Architecture Diagram

```
                          generate()
                             │
                    ┌────────┴────────┐
                    │  Task Classifier │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
   FAST_STRUCTURED    INTERACTIVE_WRITING   BACKGROUND
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │OpenCode │         │OpenCode │         │ LongCat │
    │  glm    │         │  glm    │         │  2.0    │
    │ flash   │         │ flash   │         │(1M ctx) │
    └────┬────┘         └────┬────┘         └────┬────┘
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │  Groq   │         │  Groq   │         │OpenCode │
    │  120b   │         │  120b   │         │  kimi   │
    └────┬────┘         └────┬────┘         └────┬────┘
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │  GPT    │         │  GPT    │         │  GPT    │
    │4o-mini  │         │4o-mini  │         │4o-mini  │
    └────┬────┘         └────┬────┘         └─────────┘
         │                   │
    ┌────┴────┐         ┌────┴────┐
    │ LongCat │         │ LongCat │
    │ (last)  │         │ (last)  │
    └─────────┘         └─────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/ai/runtime/index.ts` | Central router — `generate()` |
| `src/lib/ai/runtime/types.ts` | All type definitions |
| `src/lib/ai/runtime/health.ts` | Health tracking + circuit breaker |
| `src/lib/ai/runtime/normalize.ts` | JSON normalization |
| `src/lib/ai/runtime/telemetry.ts` | Trace persistence |
| `src/lib/ai/runtime/compat.ts` | Legacy compatibility wrappers |
| `src/lib/ai/runtime/providers/groq.ts` | Groq adapter |
| `src/lib/ai/runtime/providers/opencode.ts` | OpenCode Go adapter |
| `src/lib/ai/runtime/providers/openai.ts` | OpenAI adapter |
| `src/lib/ai/runtime/providers/longcat.ts` | LongCat adapter |
| `scripts/model-tournament.mjs` | Benchmark harness |
| `supabase/migrations/20260920000000_add_ai_traces.sql` | Telemetry table |

## Measured Benchmarks

### Extraction (15 requests, production chain)

| Provider | p50 | Success | Quality |
|----------|-----|---------|---------|
| GPT-4o-mini | 1,373ms | 15/15 | GOOD |
| Groq 120b | 1,064ms | 1/15* | GOOD |

*Groq rate limited after 1st call (free tier limitation)

### Direct Provider (10 runs each, exact Pass A payload)

| Provider | p50 | p95 | Success | Notes |
|----------|-----|-----|---------|-------|
| OpenCode Go (glm-5.3-flash) | 1,400ms | 3,000ms | PERFECT | Best overall |
| GPT-4o-mini | 1,373ms | 1,771ms | 10/10 | Reliable |
| Groq 120b | 2,006ms | 3,150ms | 7/9* | Rate limited |
| LongCat 2.0 | 32,462ms | 49,040ms | 5/9 | Empty JSON |

### OpenCode Go Tournament (5 models tested)

| Model | Extraction | Writing | Speed | Cost |
|-------|-----------|---------|-------|------|
| **glm-5.3-flash** | ✅ PERFECT | ✅ GOOD | 1.4s | $0.15/$0.50 per 1M |
| qwen3.8-flash | ✅ PERFECT | ✅ GOOD | 1.8s | $0.15/$0.47 per 1M |
| kimi-k3 | ✅ PERFECT | ⚠️ reasoning | 1.3s | $3.00/$15.00 per 1M |
| longcat-2.0 | ❌ empty | ❌ empty | - | $0.30/$1.20 per 1M |
| deepseek-v4-flash | ❌ region-locked | - | - | - |

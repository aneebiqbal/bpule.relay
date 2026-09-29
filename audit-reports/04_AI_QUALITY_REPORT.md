# RELAY + STUDIO — AI QUALITY REPORT

---

## 1. ROUTING

### Architecture
Two co-existing routing systems:
- **Runtime V3** (`src/lib/ai/runtime/`): Central router, all new code. Chain: OpenAI → OpenCode → Groq → LongCat.
- **Legacy** (`src/lib/ai/routing.ts` + `provider.ts`): Groq-first. Still used by draft pipeline and calibration.

### Task-to-Model Mapping

| Task | Primary | Fallback 1 | Fallback 2 | Fallback 3 |
|------|---------|------------|------------|------------|
| Lead Extraction (Pass A/C) | OpenAI luna (gpt-4o-mini) | OpenCode (glm-5.3-flash) | Groq (gpt-oss-120b) | LongCat |
| Lead Drafting | OpenAI terra (gpt-4o) | OpenCode | Groq | LongCat |
| Content Generation | OpenAI terra | OpenCode | Groq | LongCat |
| Conversation Understand | OpenAI luna | OpenCode | Groq | LongCat |
| Conversation Reply | OpenAI terra | OpenCode | Groq | LongCat |
| Style Calibration | OpenAI luna | OpenCode | Groq | LongCat |
| Job Matching | OpenAI luna | OpenCode | Groq | LongCat |

### Routing Issues
- **LongCat returns empty content for `json_object` mode** — reasoning model quirk. Only reliable in text/stream mode. Yet it's in the fallback chain for structured tasks.
- **Two routing systems produce different model selections** for the same task depending on which path is taken.
- **`SCOUT_AI_PREFERRED_PROVIDER`** overrides chain for all tasks — no per-task override.

---

## 2. SCHEMAS & STRUCTURED OUTPUT

### Schema Validation
- No Zod. All validation uses lightweight `validateShape()` engine.
- One retry on malformed output.
- `normalize()` handles: code fence stripping, trailing commas, null string coercion, case-insensitive key lookup, reasoning content extraction.

### Known Schema Issues
- **LongCat empty structured output** — falls through to next provider silently.
- **No schema versioning** — prompt changes can break downstream consumers.
- **DRAFT_SCHEMA** self-check fields (`test_1_reply_or_delete`, `test_2_not_generic`) are string enums but validated loosely.

---

## 3. QUALITY GATES

### Outreach Draft Quality
`message-forge.ts` runs 20+ hard gates:
- Surveillance language detection
- Budget assumption blocking
- Generic agency language
- AI tell detection (humanization.ts)
- Em dash abuse
- Emoji/exclamation banning
- Word budget enforcement
- Banned phrase blocking

### Content Quality
`quality-gate.ts` checks:
- Persona fit (threshold 0.05 for non-technical — too permissive)
- Hook quality
- Specificity
- Self-check passage

### Issues
- **Persona-fit threshold 0.05** means almost any content passes for non-technical roles.
- **No regeneration feedback loop** — `buildRegenerateRequest` doesn't pass failure signals from previous draft.

---

## 4. HALLUCINATION & EVIDUCIBILITY

### Critical: Evidence Fabrication Pipeline

The intelligence system has a systematic pattern of replacing AI uncertainty with invented facts:

1. **`buildFallbackProbableNeed`** (`extraction-pipeline.ts:960-983`) — When AI returns null for probableNeed, invents: "Company appears to need full-stack delivery capacity across X, Y, Z."
2. **`stabilizePassC`** (`extraction-pipeline.ts:1009-1011`) — Forces fallback when AI returns null, overriding honest "I don't know."
3. **`buildFallbackTrigger`** (`extraction-pipeline.ts:934-958`) — Invents "Company is explicitly hiring" as opportunity trigger.
4. **`buildScoringEvidence`** (`orchestrator.ts:383-398`) — Injects scoring dimension labels as BUYER_INTENT evidence entries.
5. **`demoPassC`** (`extraction-pipeline.ts:1846-1883`) — Deterministic path also invents need statements.

### Score Inflation

| Dimension | Baseline | Max | Issue |
|-----------|----------|-----|-------|
| opportunityFit | 5 | 20 | Fires even with zero signals |
| remoteEligibility | 8 | 20 | For NOT_APPLICABLE/UNCLEAR |
| needIntent | 4 | 20 | Baseline with no evidence |
| revenueIdentityFit | 5 | 20 | Baseline |
| proofStrength | 2 | 10 | Baseline |
| accessReachability | 2 | 10 | Baseline |
| timing | 3 | 10 | Baseline |
| conversionEvidence | 2 | 10 | Baseline |
| **Total** | **~31** | **~110** | **Every profile scores 31+ with zero evidence** |

### Fabrication in Fallbacks
- **`deriveSignalEvidenceFallback`** (`orchestrator.ts:717-721`) — Returns first non-chrome line of raw paste as "signal evidence." Could be market commentary, repost, industry statistic.
- **`inferProofAvailability`** — Returns true on 2+ technical signals, not actual proof match.
- **`inferCredibleIdentity`** — Returns true for any named person + hiring signal.

---

## 5. PERSONA CORRECTNESS

### Voice/Style Architecture
- Voice profiles are keyed by `rep_id` only — no per-profile or per-persona voice storage.
- `getVoiceProfile()` always returns the rep's single card regardless of selected profile.
- **Persona switching changes proof matching but NOT voice.**

### Where Voice Is Used
- Outreach draft prompts: YES (`draft.ts:182,211`)
- Content forge: YES (`forge/route.ts:66`)
- Upwork proposals: YES (`jobs/[id]/generate/route.ts:53`)
- Conversation copilot: NO (`copilot/index.ts` — never receives StyleCard)
- Inbound reply: PARTIAL (only `.summary` field, not full card)

### Content Persona Isolation
- Each route loads persona by ID and verifies ownership — no active leak.
- Forge input is a flat bag with no runtime guard — structural risk for future cross-persona contamination.

---

## 6. COSTS & BUDGETS

### Budget Configuration
- Daily total: `AI_DAILY_BUDGET` = $50
- Daily GPT-only: `AI_GPT_DAILY_BUDGET` = $10
- Per-rep daily send limit: `SCOUT_DAILY_SEND_LIMIT` = 15
- Per-rep daily connection limit: `SCOUT_DAILY_CONNECTION_LIMIT` = 20

### Cost Tracking
- Per-call cost recording with feature attribution.
- Token estimation: `ceil(text.length / 4)` when provider doesn't return usage.
- Cost table in `cost.ts` has peak/off-peak pricing for DeepSeek.

### Issues
- **Forge generates candidate B before escalation decision** — wasted compute on every failed-first-attempt.
- **Taste signal double-counting** — same journey fires `write_this` + `posting` + `posting`.
- **No per-org budget tracking** — budgets are global, not per-tenant.

---

## 7. TELEmetry

### What's Logged
Every `generate()` call logs: task, provider, model, attempt, input/output tokens, ttfb, latency, cost, runtime, site, feature, tier, cache status, fallback info, schema validity.

### Persistence
- `ai_traces` table in Supabase, org-scoped via RLS.
- Non-blocking — failures logged but don't break AI operations.

### Issues
- **`site=unknown` / `feature=unknown`** — some call sites don't pass these fields.
- **Two routing systems emit different telemetry formats** — Runtime V3 has structured traces; legacy path has console-only logging.
- **No AI output quality telemetry** — can't track hallucination rates or quality degradation over time.

---

## 8. CACHING

### Cache Configuration
- Runtime V3: 500 entries, 15min TTL, keyed by `task::promptVersion::schemaName::system::user`
- Genome cache: 100 entries, 24hr TTL
- Content cache: 200 entries, 1hr TTL

### Issues
- **No cross-user/org cache contamination** — cache key doesn't include org ID, but prompts are user-specific enough to avoid collision.
- **Cache invalidation on prompt version change** — works correctly via promptVersion in key.
- **No cache for deterministic paths** — `demoPassC` and other deterministic functions don't cache.

---

## 9. ESCALATION / FALLBACK

### Escalation Rules (Runtime V3)
- luna → terra: persistent failure after ≥2 attempts
- terra → sol: high-value + quality failure after ≥2 attempts, OR high-value after ≥3

### Escalation Rules (Legacy)
- Malformed output after ≥2 attempts
- Primary failed AND high-value
- Primary failed AND score < 4

### Issues
- **Inconsistent escalation thresholds** between two systems.
- **LongCat in structured fallback chain** — always returns empty, wastes a hop.
- **Forge escalation (candidate C) uses writer 'B'** — same persona as failed candidate B, no fresh perspective.

---

## 10. PROMPT INJECTION DEFENSE

### Protections
- `src/lib/ai/secrets.ts` — blocks prompts containing API keys, tokens, credentials.
- Applied to: `structuredJson()`, `streamChatText()`, `streamChatTextChain()`, `structuredJsonOnHost()`, `embedText()`.

### Missing
- **No prompt injection detection** for user-source content (LinkedIn profiles, pasted text).
- **No instruction boundary enforcement** — user content is interpolated into prompts without delimiters.
- **No output sanitization** for AI-generated content that might contain injected instructions.

---

## 11. RECOMMENDATIONS

1. **Remove evidence fabrication fallbacks** — let AI's null propagate as "unknown" rather than inventing needs/triggers.
2. **Zero out score baselines** — a prospect with zero evidence should score near zero.
3. **Unify AI routing** — migrate legacy path to Runtime V3, remove `routing.ts` dual-path.
4. **Add per-profile voice storage** — extend `voice_profiles` table with optional `profile_id`.
5. **Wire conversation copilot to style card** — pass full StyleCard to reply generation.
6. **Add prompt injection boundaries** — wrap user content in delimiters, scan for instruction patterns.
7. **Fix forge winner duplication** — don't assign winner to both candidate slots.
8. **Learn `shortVsDeep` taste dimension** — complete the signal path.

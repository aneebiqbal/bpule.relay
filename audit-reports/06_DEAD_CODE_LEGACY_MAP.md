# RELAY + STUDIO — DEAD CODE / LEGACY MAP

---

## DEAD CODE (Safe to Remove)

| Item | Location | Reason | Risk of Removal |
|------|----------|--------|-----------------|
| `/api/onboarding/complete` route | `src/app/api/onboarding/complete/route.ts` | Never called from UI; `RelayOnboardingExperience` calls `/api/onboarding` | Low — wire up or delete |
| `timing-engine.ts` | `src/lib/relay/timing-engine.ts` | Zero UI consumers; both call sites hardcode `connectionAccepted: false` | Low — decorative scaffolding |
| `/api/accountability/event` route | `src/app/api/api/accountability/event/route.ts` | Never called from anywhere; weakly-guarded accountability writes | Low — remove or wire properly |
| `content_engagement_events` table | Migration 0027 | No application-code consumers; no store method, route, or UI | Low — table can remain unused |
| `subscriptions` table | Migration 0023 | No application-code consumers; no store method, route, or UI | Low — table can remain unused |
| Legacy AI routing (`routing.ts` + `provider.ts`) | `src/lib/ai/routing.ts`, `src/lib/ai/provider.ts` | Superseded by Runtime V3; still used by draft pipeline and calibration | Medium — migrate remaining call sites first |
| `SCOUT_CHEAP_MODEL` / `SCOUT_STRONG_MODEL` env vars | `src/lib/ai/config.ts` | Deprecated; fall back to Groq models | Low — remove references |
| DeepSeek provider paths | `src/lib/ai/runtime/providers/` | Disabled by default (`SCOUT_DEEPSEEK_ENABLED=0`) | Low — keep for future restoration |
| `voiceProfileId` check in content routes | `src/app/api/content/generate/route.ts:115-120` | Checked but never used to fetch specific profile; always fetches rep's default | Low — remove dead check |
| `followUpDueLabel` field | `src/lib/relay/relationship-state.ts` | Declared in interface, always set to null | Low — remove field |

## LEGACY / DUAL-PATH SYSTEMS

| System | Legacy Path | Modern Path | Migration Status |
|--------|-------------|-------------|-----------------|
| AI Routing | `routing.ts` (Groq-first chain) | `runtime/index.ts` (OpenAI-first chain) | Partial — draft pipeline still uses legacy |
| AI Health | `health.ts` (simple counters) | `runtime/health.ts` (circuit breaker) | Legacy used by `provider.ts` only |
| Draft Generation | `draft.ts` (`structuredJsonChain`) | `draft-stream.ts` (`runtimeGenerate`) | Legacy used for eval/demo; modern for production |
| Content Ideas | `daily-ideas.ts` (v1) | `idea-engine.ts` (v2) | Both active; v1 ignores taste |
| Content Generation | `generate/route.ts` (v1) | `intelligence/v2/generate/route.ts` (v2) | Both active; v1 ignores taste |
| Onboarding | `relay-onboarding-experience.tsx` (Relay) | `onboarding-wizard.tsx` (Studio) | Both active; Studio broken |
| Score Display | `computeScore()` (legacy rubric) | `canonicalToLegacyScoreResult()` bridge | Bridge created; legacy still used as fallback |
| Accountability | `revenue_identity_contracts` + `day_closes` | `daily_targets` + `daily_accountability` | First system unpopulated; second active |

## DUPLICATED LOGIC

| Logic | Location A | Location B | Recommendation |
|-------|------------|------------|----------------|
| Follow-up cap | `relationship-state.ts:110` (hardcoded 3) | `message-eligibility.ts:51` (constant) | Use shared constant |
| Draft quality gates | `message-forge.ts` (outreach) | `quality-gate.ts` (content) | Different domains, keep separate but document |
| Style injection | `inject.ts` (outreach) | `content-dna.ts` (content) | Different domains, keep separate |
| Score → display bridge | `orchestrator.ts:canonicalToLegacyScoreResult` | `draft/route.ts:legacyScoreResult` (removed) | Now unified in orchestrator |

## ORPHAN UI COMPONENTS

| Component | Location | Status |
|-----------|----------|--------|
| `/conversations` page | `src/app/(app)/conversations/` | Exists but no nav link; sidebar points to `/relay` |
| `/activate` page | `src/app/(app)/activate/page.tsx` | No nav link; referenced by onboarding |
| `/manage-profiles` | `src/app/(app)/manage-profiles/page.tsx` | No nav link; referenced by onboarding |
| `/resume/generate` | `src/app/(app)/resume/generate/page.tsx` | No nav link |
| `/revenue/email` | `src/app/(app)/revenue/email/page.tsx` | No nav link |
| `/workspace/[id]` | `src/app/(app)/workspace/[revenueIdentityId]/page.tsx` | No nav link |
| `/admin/ai-usage` | `src/app/(app)/admin/ai-usage/page.tsx` | No nav link |
| `/admin/growth` | `src/app/(app)/admin/growth/page.tsx` | No nav link |
| `/studio/drafts/[id]` | `src/app/studio/drafts/[id]/page.tsx` | Outside app shell; no sidebar |

## ENVIRONMENT VARIABLES — UNUSED / DEPRECATED

| Variable | Status | Notes |
|----------|--------|-------|
| `SCOUT_CHEAP_MODEL` | Deprecated | Falls back to Groq |
| `SCOUT_STRONG_MODEL` | Deprecated | Falls back to Groq |
| `DEEPSEEK_API_KEY` | Disabled | `SCOUT_DEEPSEEK_ENABLED=0` |
| `DEEPSEEK_BASE_URL` | Disabled | |
| `SCOUT_DAILY_CONNECTION_LIMIT` | Undocumented | Not in `.env.local.example` |

## NAMING ISSUES

| Issue | Location | Impact |
|-------|----------|--------|
| `organization_rulebooks` (plural) vs migration `0022_organization_rulebook.sql` (singular) | Migration file vs table | Confusing but works |
| `content_engagement_events` table with no consumers | Migration 0027 | Dead table |
| `subscriptions` table with no consumers | Migration 0023 | Dead table |
| `GoldenCaseRow` (DB) vs `GoldenCase` (eval input) | `store/types.ts` vs `ai/eval.ts` | Different types, similar names |
| `totalDecisions` (>=4 vs >=6) | `daily-decision.ts` vs `persona refinement` | Deliberately different thresholds |

## RECOMMENDATIONS

1. **Remove `/api/onboarding/complete`** or wire it up from `RelayOnboardingExperience`
2. **Remove `timing-engine.ts`** or actually wire it to the UI
3. **Remove `/api/accountability/event`** or implement it properly
4. **Migrate legacy AI routing** — move `draft.ts` and calibration to Runtime V3, delete `routing.ts`/`provider.ts`
5. **Migrate v1 content paths** — unify on v2 idea engine and v2 generation
6. **Add nav links** for orphan routes or remove them
7. **Delete `content_engagement_events` and `subscriptions` tables** if not needed within 30 days
8. **Document deprecated env vars** in `.env.local.example`

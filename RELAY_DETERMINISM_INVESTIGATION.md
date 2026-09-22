# Phase 3 — Determinism Investigation

Status: **Partial — blocked on live AI provider credentials in this environment.**
Read this section first; it changes what the rest of this document can and can't claim.

## Environment constraint (must be disclosed, not worked around)

This sandbox's `.env.local` has **no AI provider credentials** (`GROQ_API_KEY`,
`OPENCODE_API_KEY` / `OPENCODE Go`, `OPENAI_API_KEY`, `LONGCAT_API_KEY` are all
unset — only Supabase and `SCOUT_DB` are configured). `hasProvider()` returns
`false`, so `demoMode` is true and **every** call to `runPassA`/`runPassC` takes
the `catch` branch and falls back to `demoPassA`/`demoPassC` — pure regex/heuristic
functions with no LLM involved.

I built a 20-run repeated-execution harness (`scripts/determinism-harness.mjs`)
and ran it against all 37 golden-corpus cases (740 total runs). Result: **0
divergences at any stage, for any case.** This is expected and does **not**
resolve the reported bug — it only proves the deterministic fallback path and
the scoring engine (`computeCanonicalScore`) are stable, which was the easy
half of the problem. It does **not** touch the actual mechanism the bug report
describes, which requires a real LLM call to reproduce.

**I have not fabricated a "79 vs 57" reproduction. I have not invented AI
provider output to simulate the bug.** Doing either would violate Phase 64 (no
test manipulation) in spirit even though this isn't a test — it would be
manufacturing evidence. What follows instead is (a) empirical results from
what I *could* run, and (b) a static-analysis root-cause hypothesis backed by
specific code citations, explicitly labeled as unverified pending live-provider
access.

**To close this out for real, I need one of:**
- Real `GROQ_API_KEY` / `OPENCODE` / `OPENAI_API_KEY` / `LONGCAT_API_KEY` values added to `.env.local` (or a staging environment where they're already present) so the harness can run Pass A/Pass C against an actual model, or
- Access to existing production/staging `ai_traces` rows for a lead that's known to have scored differently across runs, so I can diff real historical extraction outputs instead of generating new ones.

I'm flagging this now rather than silently declaring victory on a fallback-only run. Let me know which is available and I'll finish Phase 3/67 properly.

---

## What IS established (verified by reading the actual pipeline code)

Pipeline shape (confirmed against `src/lib/intelligence-v2/orchestrator.ts`):

```
rawText
  → classifyInput()                              [pure, regex-based]
  → runIntelligencePipeline()
      → runPassA()      — LLM call (FAST_STRUCTURED, temp 0.1) or demoPassA fallback
      → normalizePassA() — PURE, no LLM (Pass B)
      → runPassC()      — LLM call (FAST_STRUCTURED, temp 0.1) OR skipped entirely
                           if demoPassC() alone is "sufficient" (see below)
  → assessExtractionCompleteness()                [pure]
  → evaluateCompletenessGate()                    [pure]
  → repairExtraction()  — LLM call, ONLY if gate fails or completeness < 40
  → computeCanonicalScore()                       [PURE — verified, see below]
  → assemble CanonicalProspectIntelligence
```

### 1. `computeCanonicalScore` (scoring-engine.ts) is a pure function — confirmed

Read the full 623-line file. No `Math.random()`, no `Date.now()`, no I/O, no
LLM calls. It's a deterministic function of `ScoreInput`. **For identical
`ScoreInput`, it will always produce an identical score, breakdown, and
qualification.** This rules out the scoring engine itself as a divergence
source — good news, and consistent with the architecture the sprint brief asks
for (Phase 4/8). The bug is not in "the score" — it's in what gets fed to it.

### 2. No hidden randomness/wall-clock leakage into business logic

Grepped all of `src/lib/intelligence-v2/*.ts` for `Math.random`, `Date.now()`,
`new Date()`, `crypto.randomUUID()`. Every hit is confined to trace/metadata
fields (`intelligenceRunId`, `computedAt`, `scoredAt`, latency timers) —
none of them feed into extraction, normalization, or scoring inputs. This
rules out a whole class of "accidental nondeterminism" bugs.

### 3. LLM calls use `temperature: 0.1`, never `0`, and no `seed` — confirmed across all 4 providers

`src/lib/ai/runtime/index.ts:341-348`:
```ts
function defaultTemperature(task: TaskClass): number {
  switch (task) {
    case 'FAST_STRUCTURED': return 0.1   // Pass A and Pass C both use this
    ...
```
And in every provider adapter (`groq.ts:97`, `opencode.ts:176`, `openai.ts:90`,
`longcat.ts:94`): `temperature: params.temperature ?? 0.1`. None of the four
provider adapters send a `seed` parameter, even though at least one backing
API (OpenAI-compatible chat completions) supports `seed` for reproducible
sampling. This is a **real, confirmed architectural gap** — not a hypothesis —
though whether it's *sufficient* to explain a 79→57 swing (as opposed to a
handful of points) can't be confirmed without a live run.

### 4. Provider/model fallback changes which model answers the SAME logical call — confirmed

`getChainForTask('FAST_STRUCTURED')` returns `[opencode, groq, openai]` in
that order. `generate()` walks the chain and uses the first provider that has
credentials, is "healthy" (circuit breaker via `isAvailable()`), and doesn't
throw. This means the exact same `rawText` input can be answered by
**glm-5.3-flash (OpenCode)**, a **Groq-hosted model**, or **GPT** depending on
transient health/rate-limit state — three different models, not just sampling
noise on one model. `AiTrace.fallback` and `AiTrace.provider`/`model` are
recorded per-call, so this is directly observable in `ai_traces`, but nothing
in the current architecture normalizes for the fact that different providers
may interpret ambiguous prose differently. This is the strongest single
candidate for "Run 3 → different interpretation/reasoning" in the bug report,
and it long-predates and is independent from the "36 call sites not yet on
V3 runtime" gap I flagged in the Phase 0 baseline — **I am not assuming that
gap is the cause, per your instruction; this fallback-chain effect exists
even for the one call site (extraction) that IS fully on V3.**

### 5. `validatePassA`'s defensive coercion implies providers already return structurally inconsistent JSON — confirmed, and load-bearing

`extraction-pipeline.ts:479-598` (`validatePassA`) does case-insensitive key
lookup ("GPT returns PERSON, COMPANY; Groq returns person, company" — comment
in the code itself) and coerces the literal strings `"null"`/`"NULL"`/`"None"`/
`""` to actual `null`/`[]`. This is defensive code that exists *because*
engineers already observed real provider output disagreeing on shape. Once
parsed, two runs that extract e.g. different `opportunity.signals` arrays (one
includes `hiring_pressure`, the other doesn't; one lists 2 `technicalSignals`,
the other lists 5) will feed **legitimately different** `ScoreInput` into the
(deterministically correct) scoring engine and get **legitimately different**
totals — `scoreOpportunityFit` alone swings between 4 and 18 points depending
on which signals are present, `scoreNeedIntent` between 3 and 19. A handful of
dimension swings of that size stacked together easily explains a 79→57 gap.

### 6. Pass C is conditionally skipped based on Pass A's own output — a second-order amplifier

`runPassC` (extraction-pipeline.ts:850-914) only calls the LLM if the
deterministic fallback (`demoPassC` derived from Pass A's fields) is
"insufficient" (`hasSignals && hasPersonOrCompany && probableNeed !== null &&
opportunityTrigger !== null`). This means: if Pass A's extraction varies
run-to-run (per #5), it can flip whether Pass C runs at all — one run takes
the fast deterministic path, another triggers a second LLM call with its own
independent variance. This compounds whatever variance Pass A introduces
rather than damping it.

### 7. `infer*` heuristics in the orchestrator are pure but sensitive to Pass A output — not independently random, but a divergence multiplier

`inferProofAvailability`, `inferProofStrength`, `inferCredibleIdentity`,
`inferPastWinResemblance` (orchestrator.ts:222-280) are all pure functions of
`intelligence` (Pass A/B output) — no independent randomness — but they
threshold on exact array lengths (`technicalSignals.length >= 2`, `>= 3`,
`>= 5`) and specific signal membership. Small extraction differences near a
threshold (4 vs 5 technical signals) flip `hasRelevantProof`/`proofMatchStrength`
booleans that then move `scoreProofStrength` and `scoreRevenueIdentityFit` by
several points each. Not a new root cause — an amplifier of #5.

---

## Root-cause ranking (evidence-graded, not guessed)

| # | Hypothesis | Evidence status |
|---|---|---|
| 1 | Different runs extract different structured evidence from the same prose (Pass A LLM variance — provider swap, temp 0.1, or genuine model ambiguity) | **Confirmed as architecturally possible** (temp 0.1 + no seed + fallback chain + defensive JSON coercion). **Not yet confirmed as the actual live-run cause** — needs a real provider run. |
| 2 | Provider/model fallback silently swaps which model answers the call | **Confirmed as architecturally possible**, same caveat. |
| 3 | Scoring engine itself is nondeterministic | **Ruled out.** Pure function, verified by code read + 740 stable fallback-mode runs. |
| 4 | Hidden randomness (Math.random/Date.now leaking into business logic) | **Ruled out.** Grep-verified — confined to metadata. |
| 5 | Revenue Identity context changing between runs | **Not applicable to `/prospect` analyze** — `produceCanonicalIntelligence` doesn't take identity as scoring input; `hasCredibleIdentity` is inferred from extracted content only, not from which identity/org is active. Re-check for `/leads` save-and-score path separately (not yet audited — next step). |
| 6 | Stale vs. fresh intelligence / re-extraction semantics | Architecture already distinguishes these correctly at the type level (`rescoreEvents`, `shouldRescore()`, `SCORE_VERSION` check) — **looks correct on read**, not yet exercised against a real re-score flow. |
| 7 | Different surfaces recomputing independently | **Partially ruled out for `/prospect`**: `getCanonicalScore`/`getDisplayScore`/`getScoreBreakdown` explicitly forbid recomputation and every consumer in `route.ts` reads `canonical.canonicalScore` directly, never recomputes. **Not yet verified for Lead Detail, Today, Revenue Intelligence, Email Outreach, Next Actions** — that's Phase 13 (cross-surface consistency), still to do. |
| 8 | Persistence/cache behavior (page refresh triggering silent re-score) | **Not yet audited** — next step is tracing `/api/leads` save path and whatever reads `canonical_intelligence` back out, to confirm reads never call the orchestrator again. |

## What this means for Phase 4-8 (do NOT act on this yet without live confirmation)

If #1/#2 are confirmed against a live provider, the fix is **not** "make the
LLM more careful" — per the sprint's own governing principle, the fix is
architectural: canonicalize evidence so that wording-level extraction variance
gets absorbed before it reaches scoring (Phase 5's evidence canonicalization),
and/or persist-and-reuse extraction by input hash so a second identical
paste doesn't invoke the LLM a second time at all (Phase 6 — `intelligenceInputHash`,
which does not appear to exist yet as a concept anywhere in this codebase; I
searched for it and found no persisted content hash gating re-extraction).
I have not implemented either yet — confirming the actual mechanism first,
per your instruction, before touching scoring/prompts/thresholds.

## Immediate next steps (proceeding without waiting on provider access)

1. **Done — no `intelligenceInputHash`/source-hash concept exists anywhere.** Confirmed by grep across the repo (see #8 below). This is a real P0 architectural gap independent of what a live-provider test would show: three separate routes (`/api/leads/extract`, `/api/prospect/analyze`, `/api/inbound/analyze`) call `produceCanonicalIntelligence` fresh on every request with zero reuse-on-unchanged-input, so "a page refresh must never accidentally trigger a new business truth" is currently violated by design whenever a live LLM is in the loop. Not yet fixed — this is the next and largest piece of Phase 6 work.
2. **Done — traced `/api/leads` save + read-back and cross-surface score consumers (Phase 2/13).** Found and fixed a real P0: Lead Detail (`/leads/[id]`) was recomputing an independent legacy 0-12 score instead of reading the persisted canonical score, unlike every other surface (Leads list, Today/Relay queue, draft API). See REL-FUNC-005 in `BUG_LEDGER.md`, commit with `canonicalToLegacyScoreResult()`. Still pending: a full sweep of Revenue Intelligence, Email Outreach, and Conversation views specifically (not yet audited).
3. **Done — re-ran the 3 failing `intelligence-v2-benchmark.test.ts` cases.** They were NOT a symptom of the determinism/duplicate-scoring root causes above — they were three separate, narrow bugs in the deterministic regex fallback extractor: a test fixture typo, a clinician-classifier false-positive on the common word "do" that was silently zeroing out real opportunity signals (REL-FUNC-006 — the most serious of the three, since it's a silent correctness bug, not just a missed case), a missing structural job-posting-without-the-word-"hiring" detector (REL-FUNC-007), and a too-narrow office-location regex (REL-FUNC-008). All fixed, all 21 cases in that file now pass, full suite still at the same 9 pre-existing unrelated failures (was 12; the 3 intelligence-v2 ones are now gone) with no new regressions.
4. **Not yet done** — the 8/37 golden cases that score exactly 0 in fallback mode despite `known_outcome: WON` (`won-004`, `won-009`, `won-011`, `won-012`, `won-015`, `won-017`, `won-018`, `strong-005`) — likely the same class of fallback-extraction weakness (possibly pipe-delimited profile formats not handled by the regex extractor). Logging here as still open, not yet investigated in depth.
5. **Still blocked** — the actual live-LLM-provider determinism question (the original 79→57 report) still needs real provider credentials or access to historical `ai_traces` rows to close out. Everything above was checkable and fixable without that access; this remains the one piece that isn't.

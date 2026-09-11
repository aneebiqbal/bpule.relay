# Changelog

Internal, hand-maintained. Bump `src/lib/version.ts` (and the rail marker) with each entry.

## 0.7.0 — Phase 8: Upwork gap, CSV import, archive, PWA, production ops

- **Upwork jobs**: separate entity from leads with its own rubric (out of 10:
  budget, competition, skill match, urgency/takeover signal). New intake flow
  at `/upwork/new`, extraction, scoring, and job list at `/upwork`.
- **Bulk CSV import**: `/leads/import` accepts CSV with per-row validation
  and dedupe checking. Clear per-row results (imported / duplicate / invalid)
  shown after upload. Sourcer role sees Import in the nav.
- **Searchable archive**: `/archive` with full-text search across leads,
  proof items, and Upwork jobs. Composable filters: entity type, status,
  signal type, play, rep, date range. Backed by Postgres tsvector + GIN.
- **PWA + push notifications**: web app manifest, service worker for offline
  shell, and push notification support for exactly two events: reply received
  and follow-up eligible. Push subscription API at `/api/push/subscribe`.
- **Production ops**: `OPS.md` with backup/restore procedure (tested once
  before going live), CI workflow (lint + typecheck + build), monitoring
  thresholds, and a real rollback procedure using Vercel deployment promotion.

## 0.6.0 — Phase 7: eval harness, few-shot, best-of-two, semantic proofs

- **Eval harness**: golden set table, eval runs table, and admin screen at
  `/team/eval`. Every prompt change gets scored against real cases with known
  outcomes before shipping.
- **Few-shot injection**: `few_shot_wins` table auto-populated from messages
  that got replies. Best-matching examples (by play + signal + tags) are
  injected into the draft prompt, capped at 2.
- **Best-of-two drafting**: two cheap-model variants generated in parallel,
  self-checked, and the stronger one streamed to the client. The weaker
  variant is available as a one-click swap in the lead workspace.
- **Semantic proof matching**: `proof_items` now carries a pgvector embedding.
  Proof retrieval merges tag overlap with cosine-similarity search so
  "Rails API" can match "ruby-on-rails".
- **Draft quality indicator** in the lead workspace: shows which few-shot
  examples informed the draft, why the primary was picked, and a toggle to
  compare the second variant.

## 0.5.0 — Production pass

- One shared component system: loading/error states on `Button`, inline
  validation on `Input`/`Textarea`/`Select`, plus new `Skeleton`, `Spinner`,
  `Select`, `Dialog`, `Toast`, and `IdentityChip` primitives.
- Route-level `loading.tsx`, `error.tsx` (with retry + error reporting), and a
  styled `not-found.tsx`; `robots.ts` disallows all crawlers and every route
  carries `noindex, nofollow`.
- Today: virtualized queue, skeleton metrics, top-lead workspace prefetch.
- Lead workspace: drafts cached per artifact (no regeneration on tab switch),
  memoized score/proof/timeline panels, partial draft preserved on network drop.
- Onboarding: visible step progress and a reveal animation on the style card.
- New Lead: distinct messages for empty, too-short, and URL-only pastes.
- App rail: live send counter against the daily ceiling, identity chip, and a
  version marker.
- Destructive actions use an accessible dialog instead of `window.confirm`.
- Model provider is Groq (extract/classify on Llama 3.1 8B Instant, drafts on
  Llama 3.3 70B Versatile) with a rate-limit backoff queue.

## 0.4.0 — Profiles, proof, tags, streaming

- Multi-platform identity profiles with CV upload and proof items matched by
  tag overlap. Draft pipeline streams token by token over SSE.

## 0.3.0 — First-person voice and Groq

- Every template and prompt reads as one person (first-person singular, no
  team or headcount). Model routing consolidated behind one config point.

## 0.2.0 — Calibrate -> Extract -> Score -> Draft loop

- Style-card calibration, deterministic 12-point rubric, single-call draft with
  self-check, facts guard stripping unapproved numbers and em dashes.

## 0.1.0 — Skeleton

- Auth (magic link), Today queue, scoring, and the lead workspace.

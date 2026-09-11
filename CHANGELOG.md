# Changelog

Internal, hand-maintained. Bump `src/lib/version.ts` (and the rail marker) with each entry.

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

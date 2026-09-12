# Scout

Internal lead-gen operations system for bpulse (work codename: Relay). Runs the
Calibrate -> Extract -> Score -> Draft pipeline end to end, with scoring as pure
arithmetic (zero model tokens) and a single AI call per lead at draft time.

## Pipeline

1. **Calibrate** (one time per rep) - a quiz plus optional pasted messages build
   a style card. Every later draft is written in that voice.
2. **Extract** - raw research becomes structured fields, using the cheapest
   capable model.
3. **Score** - a published 12-point rubric in code only. No model is involved.
   - Signal (max 7): hiring, understaffed, funding, stale, weak stack, pain,
     asking.
   - Completeness (max 5): URL, name, title, specific evidence, verbatim quote.
   - Verdict: send (10-12), research_more (7-9), skip (0-6).
4. **Draft** - a single strong-model call drafts AND self-checks against two
   fixed tests (a senior engineer would reply; the message would not survive a
   company swap). A failed check rewrites the draft once on the same call
   shape, never ships half-passed.

## Guardrails

- No auto-send anywhere. Messages are human copy-pasted; the app logs the text
  you actually sent so outcomes can be scored.
- Drafts may only claim numbers that exist in the Facts table. Anything else is
  stripped in code before display.
- No em dashes in any generated text; replaced with hyphens.
- A company marked `no` or `dead` is locked for everyone, forever (app-level
  fuzzy check plus a DB unique index backstop).
- Daily send ceiling per rep (default 15). No follow-up or reply drafting in
  this pass; the schema and routes are scaffolded, the logic is TODO.

## Modes

- **demo** (default): in-memory store with obvious FAKE seed data and a fixed
  demo rep. Set `GROQ_API_KEY` to use the real models, or run without it and
  the deterministic demo paths cover the whole loop.
- **supabase**: real Postgres + Auth + RLS. Apply `supabase/migrations` and set
  the env vars below.

## Models (Groq)

All model calls go through `src/lib/ai/routing.ts` -> `config.ts`; no feature
code names a model id. By default:

- Extraction runs on `openai/gpt-oss-20b` (override `SCOUT_EXTRACT_MODEL`).
- Other structuring tasks (tag, calibrate, classify fallback) run on `openai/gpt-oss-20b`.
- Drafting runs on `openai/gpt-oss-120b` and self-checks in the same call.

Override with `SCOUT_CHEAP_MODEL` / `SCOUT_STRONG_MODEL`. Free-tier Groq rate
limits are handled by a backoff queue that reports "queued, drafting shortly"
instead of failing the draft.

## Getting started

```bash
pnpm install
cp .env.local.example .env.local   # edit as needed
pnpm dev
```

To move to Supabase mode:

```bash
# 1. Point .env.local at the hosted project (URL + anon key).
# 2. Push the schema, RLS, and seed migrations:
supabase link --project-ref <your-project-ref>
supabase db push
# 3. Create the dev auth users via the GoTrue admin API
#    (raw SQL auth inserts can break hosted sign-in):
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> node scripts/seed-dev-users.mjs
# 4. Link reps to those users (idempotent by email):
supabase db push   # applies pending linking migration if not already
```

Dev users: `aneeb@scout.dev`, `hassan@scout.dev` (admin), `madiha@scout.dev`,
`ahmad@scout.dev`, password `scout-dev-password`.

## Scripts

```bash
pnpm dev        # dev server
pnpm build      # production build
pnpm lint       # eslint
pnpm exec tsc --noEmit   # typecheck
```

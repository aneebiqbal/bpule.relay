# SYSTEM.md

The real source of truth for this repo, replacing every stale reference to
`CORE.md` (a document that has never actually existed here). If this file
and the code disagree, the code wins — update this file, don't trust it
blindly for anything version-sensitive (model ids, thresholds, table names).

## What this is

**Relay** is a BD/lead-generation pipeline for a small software delivery
team: paste raw research on a prospect (a LinkedIn profile, a forum post, a
job listing), and it extracts a structured lead, scores it against an
organization-configurable rubric, and drafts outreach in the rep's own
calibrated voice — never inventing a fact, a client, or a number that isn't
already on file. A human always sends the message; nothing here posts or
sends on anyone's behalf.

**Content Studio** ("Studio") is a separate, self-contained content-writing
loop for the same reps: ask a short question (or surface a real research
finding), draft one post from a real answer, and let the person accept,
reject, or edit it. It learns which topics and structures actually get kept
versus skipped, and adjusts what it suggests next — never posts
automatically, never predicts virality, never claims a specific outcome.

Both share one Postgres database, one multi-tenant model, and one model-tier
routing layer, but their generation pipelines, scoring rules, and UI are
independent — a change to one should not require touching the other.

## The follow-up rule

ONE follow-up, five **working** days (Mon-Fri, not calendar days) after the
last send with no reply, then never again. A reply is permanent; a lead
that has already received its one follow-up is permanently locked out of
another, forever — this is not a repeating reminder. Implemented in
`src/lib/leads/followup.ts` (`businessDaysBetween`, `isFollowupDue`),
enforced in the UI via `src/components/lead-workspace.tsx`'s
`followupEligible` (status `'followed_up'` is deliberately excluded from
the eligible set — that status *is* the permanent lock, since
`markContacted` moves a lead into it the moment its one follow-up is sent
and nothing ever moves it back), and mirrored in the DB notification
trigger (`check_followup_eligible`, `supabase/migrations/0033_followup_five_business_days.sql`).
An earlier version of this codebase used a flat 3-calendar-day window with
no single-use lock — that was a real bug, since fixed; if you find code or
a test asserting 3 calendar days or repeatable follow-ups, that's the old,
wrong behavior, not a valid alternate spec.

## The model tier chain, as it actually stands today

Defined in `src/lib/ai/config.ts` and `src/lib/ai/routing.ts` — architecture
**v2.2 (September 2026)**. Every host is optional; a host only enters a
chain if its API key is set, so an environment with only `GROQ_API_KEY`
still works exactly as the default, intended state.

**Core routing (production):**

1. **Groq free tier** (`GROQ_API_KEY`) — extraction, classification, fallback.
   Models: `openai/gpt-oss-20b` (cheap) / `openai/gpt-oss-120b` (strong).
2. **LongCat-2.0** (`LONGCAT_API_KEY`) — primary writer for drafts, posts,
   proposals, emails, connection notes.
3. **OpenAI** (`OPENAI_API_KEY`) — escalation only when cheaper tiers fail
   deterministic quality gates. Target: <5% of generations reach GPT.

**DeepSeek is disabled by default** (`SCOUT_DEEPSEEK_ENABLED=0`). Config
functions remain for future restoration but return empty when disabled. No
production workflow depends on DeepSeek.

**Conditional generation** (draft.ts, draft-stream.ts, forge.ts):
- LongCat → deterministic quality gate → PASS: return (1 call).
- FAIL: Groq corrective retry → GPT escalation (rare).
- GPT is NOT a normal pipeline stage.

**Structuring tasks** — `pickModelChain()`: Groq cheap → OpenAI fallback.
**Drafting** — `pickDraftChain()`: LongCat → Groq strong → OpenAI escalation.

**Deterministic by default:** genome construction, onboarding questions,
proof tagging, persona refinement. Set `SCOUT_GENOME_AI=1` to enable AI-assisted
genome.

`hasProvider()` is true once *any* provider has a key set.

## Environment variables

Every one of these is read somewhere in `src/`. None has a required value —
everything has a safe default or a demo-mode fallback — but this list is
complete, unlike `.env.local.example`, which currently omits several of the
optional ones marked below.

**Mode selection**
| Var | Effect |
|---|---|
| `SCOUT_DB` | Force `demo` or `supabase`. Unset: `supabase` if both Supabase vars below are set, else `demo`. |

**Supabase** (required together for real, persistent multi-tenant mode; absent, the app runs fully in-memory)
| Var | Effect |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key, RLS-enforced. |
| `SUPABASE_SERVICE_ROLE_KEY` | Bypasses RLS. Only used by cron-triggered routes (`/api/eval/cron-run`, `/api/few-shot/refresh`'s GET) and offline `scripts/*.mjs` — never by a route serving a browser request. |

**Cron**
| Var | Effect |
|---|---|
| `CRON_SECRET` | Required by every cron-triggered route (`requireCronSecret`); a request without it is refused outright rather than run unauthenticated. Vercel sets this automatically for dashboard-configured cron jobs. |

**Model providers** (each optional; a host only joins its tier chain if its key is set)
| Var | Tier | Default |
|---|---|---|
| `GROQ_API_KEY` / `GROQ_BASE_URL` | extraction/fallback | `https://api.groq.com/openai/v1` |
| `SCOUT_TIER0_CHEAP_MODEL` / `SCOUT_TIER0_STRONG_MODEL` | Groq models | `openai/gpt-oss-20b` / `openai/gpt-oss-120b` |
| `LONGCAT_API_KEY` / `LONGCAT_BASE_URL` / `LONGCAT_MODEL` | primary writer | `https://api.longcat.chat/v1` / `LongCat-2.0` |
| `OPENAI_API_KEY` / `OPENAI_CHAT_BASE_URL` | escalation | `https://api.openai.com/v1` |
| `SCOUT_TIER4_MODEL` | OpenAI model | `gpt-4o-mini` |
| `SCOUT_DEEPSEEK_ENABLED` | restore DeepSeek tiers | `0` (disabled) |
| `SCOUT_GENOME_AI` | AI-assisted genome | `0` (deterministic) |
| `AI_DAILY_BUDGET` | soft daily budget USD | `50` |
| `AI_GPT_DAILY_BUDGET` | GPT-specific budget USD | `10` |
| `DEEPSEEK_API_KEY` / `DEEPSEEK_BASE_URL` | disabled by default | `https://api.deepseek.com/v1` |
| `SCOUT_CHEAP_MODEL` / `SCOUT_STRONG_MODEL` | **deprecated** | falls back to Groq |

**Embeddings** (semantic proof matching — unrelated to the chat tiers above)
| Var | Effect |
|---|---|
| `EMBEDDING_API_KEY` | Defaults to `OPENAI_API_KEY`, then `GROQ_API_KEY`. |
| `EMBEDDING_BASE_URL` | Default `https://api.openai.com/v1`. |
| `SCOUT_EMBEDDING_MODEL` | Default `text-embedding-3-small`. |

**Site / misc**
| Var | Effect |
|---|---|
| `NEXT_PUBLIC_SITE_HOST` | The team's public site host; used by `sanitizeDraft` to strip links to it when the site isn't live yet (facts table `Site live` flag). |
| `ERROR_WEBHOOK_URL` | Optional error-reporting webhook. |
| `SCOUT_DAILY_SEND_LIMIT` | Per-rep daily DM/follow-up ceiling. Default `15`. |
| `SCOUT_DAILY_CONNECTION_LIMIT` | Per-rep daily connection/Upwork ceiling. Default `20`. Not currently documented in `.env.local.example` — worth adding there. |

## The multi-tenant model

Every tenant-scoped table carries an `organization_id` column, and Row Level
Security policies on each one restrict every read and write to
`organization_id = current_org_id()`. A rep belongs to exactly one
organization (`reps.organization_id`); there is no cross-org access path in
the application layer — isolation is enforced at the database level, not
just filtered in application code, so a bug in a route handler can't leak
another tenant's rows.

Three RLS test scripts exist; they are not interchangeable and have a real
history worth knowing before trusting any of their output:

- **`supabase/tests/rls-adversarial.ts`** (run via `npx ts-node`) is the
  most complete: a single-org sweep across ~23 tenant-scoped tables in both
  directions, with per-table `✅ <table>: N visible, M leaked` output. This
  is the one that has actually been run and produced a clean pass — treat
  its output as the real evidence of isolation, not the `.mjs` port below.
- **`scripts/rls-multitenant.mjs`** creates two brand-new organizations and
  reps through the real signup path and asserts zero cross-visibility, both
  directions, across 4 tables (`leads`, `facts`, `plays`,
  `content_personas`). This is the one wired into CI
  (`.github/workflows/ci.yml`, job `rls-adversarial`, triggered on any PR
  touching `supabase/migrations/`) — but it was committed with TypeScript
  syntax inside a `.mjs` file and could not run at all (`node --check`
  failed) from its first commit until it was fixed. Its narrower table list
  is the thing to widen if you want it to match `rls-adversarial.ts`'s
  coverage.
- **`scripts/rls-adversarial.mjs`** is a third, single-org variant against
  two pre-seeded dev reps (`aneeb@scout.dev`/`madiha@scout.dev`) — also not
  wired into CI, requires those dev users to already exist on the target
  project.

Don't assume a script that exists means it has actually been run
successfully — check its git history and, for anything `.mjs`, run
`node --check` on it before trusting its coverage.

## Known naming things to watch for

- **`organization_rulebooks`, always plural.** The migration file that
  creates it is named singular (`0022_organization_rulebook.sql`), but the
  actual table — and every reference to it in code
  (`src/lib/score/rulebook.ts`) — is plural. A commit
  (`6b8076e`) once added the singular string to the RLS adversarial test's
  table list; it was wrong and broke that test's query (the table has no
  `id` column — its primary key is `organization_id` itself — so the
  generic `id, organization_id` select also had to be special-cased). Fixed
  in the very next commit (`d97fc2c`). If you're writing a query or a test
  against this table: it's `organization_rulebooks`, and its select list
  can't blindly include `id`.
- **`content_engagement_events`** and **`subscriptions`** exist as real
  tables (migrations 0027 and 0023) with zero application-code consumers as
  of this writing — no store method, no route, no UI reads or writes
  either one. Not naming bugs, just tables provisioned ahead of the code
  that will eventually use them. Don't assume either one is wired up
  without checking first.
- **Two different "not enough decisions yet" thresholds, both named
  `totalDecisions`, on purpose, not a bug.** `src/lib/content/daily-decision.ts`'s
  internal `totalDecisions()` helper uses `>= 4` to gate confidence on
  *today's suggestion* — a cheap, per-day UX call. Separately,
  `src/app/api/content/personas/[id]/refine/route.ts` uses `>= 6` to gate
  whether to run an actual AI call that rewrites the persona's stored voice
  — a heavier, harder-to-undo action that reasonably wants more evidence
  first. Same name, same underlying concept, deliberately different bars
  for different-weight decisions. Don't conflate them when reading either
  one, but there's nothing here to unify.
- **`GoldenCaseRow`** (the DB-backed golden-set row, `src/lib/store/types.ts`)
  and **`GoldenCase`** (`src/lib/ai/eval.ts`'s pure-function input shape) are
  two different, similarly-named types for two different layers — one is a
  stored row, the other is what you hand directly to `runEval()`. Building
  the latter from the former is `src/app/api/eval/run/route.ts`'s job
  (`runEvalHarness`); don't assume they're interchangeable.

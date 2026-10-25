# Lead Engine — complete audit

The Cloudflare Worker in `/Users/mac/Desktop/relayjobsapply/leadengine`. One Worker, 26 modules,
~4,100 lines, 7 D1 migrations, 39 tests. Everything below is read from source.

## 1. What it is, and why it looks the way it does

A single Cloudflare Worker runs an autonomous lead engine on the **free tier**. The entire
architecture is shaped by two hard limits:

| Limit | Consequence |
| --- | --- |
| **50 subrequests per invocation** (every D1 query, AI call, `fetch`) | reads are combined into `batch()` calls; writes are one batch per lead |
| **10 ms CPU per invocation** | a pull cron fetches **one** source per run; no HTML parsing until a posting is kept |

That is why it looks over-engineered for a hobby project. Every "weird" choice — rotation
scheduling, one batch per lead, the 8b/70b model split, the veto fit — exists to stay inside
those two numbers.

## 2. Entry points (`src/index.js`)

Three handlers on one Worker:

| Handler | Trigger | Does |
| --- | --- | --- |
| `fetch(req, env, ctx)` | HTTP | dashboard, all actions, all `/api/*` JSON routes, `/health` |
| `scheduled(event, env, ctx)` | 5 cron triggers | pull, drain, mail tick, housekeeping |
| `email(message, env, ctx)` | Cloudflare Email Routing | LinkedIn job alerts → new leads |

### Auth

`APP_PASSWORD` secret. Cookie `le_auth=<password>` (30 d) or HTTP Basic for `/api/*`.
`authed()` returns `true` when the secret is unset — **the dashboard is wide open**.

## 3. Every platform it pulls from

### Job / startup sources (`src/sources/`)

| Source id | Platform | Endpoint | Auth | Notes |
| --- | --- | --- | --- | --- |
| `hn_whoishiring` | Hacker News | `hn.algolia.com/api/v1/search_by_date?tags=comment,story_{thread}` | none | comments on the monthly "Who is hiring" thread |
| `yc_hiring` | Y Combinator | `yc-oss.github.io/api/meta.json` + `api/batches/{slug}.json` | none | newest 5 batches, `isHiring` and `team_size <= 40`; written as `kind: "client"` |
| `remoteok` | RemoteOK | `remoteok.com/api` | none | first array element is metadata, skipped |
| `jobicy` | Jobicy | `jobicy.com/api/v2/remote-jobs?count=100&industry=engineering&tag=python` | none | tag is hardcoded `python` unless overridden |
| `remotive` | Remotive | `remotive.com/api/remote-jobs?category=software-dev&limit=100` | none | |
| `arbeitnow` | Arbeitnow | `arbeitnow.com/api/job-board-api?page=N` | none | 2 pages |
| `himalayas` | Himalayas | `himalayas.app/jobs/api?limit=20&cursor=` | none | cursor pagination, 5 pages |
| `jobspipe` | JobsPipe | `api.jobspipe.dev/v1/{sandbox/}jobs/search` (POST) | optional key | falls back to the sandbox endpoint with no key |
| `ats_greenhouse` | Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` + `/jobs/{id}` | none | list first; description fetched only for kept jobs |
| `ats_lever` | Lever | `api.lever.co/v0/postings/{slug}?mode=json` | none | |
| `ats_ashby` | Ashby | `api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` | none | |
| `linkedin_paste` | LinkedIn | `linkedin.com/jobs-guest/jobs/api/jobPosting/{id}` | none | login-walled; falls back to pasted text |
| `linkedin_email` | LinkedIn | Email Routing | — | extracts job links from alert emails |

### Enrichment / verification platforms

| Platform | Used for |
| --- | --- |
| Company websites | digital footprint: homepage fetched once, summarised by the model |
| `bing.com/search?format=rss` | company-site discovery + verification signals (freelance-marketplace footprint, funding/press) |
| Notion API | tracking board, page bodies, card comments |
| Gmail SMTP 465 / IMAP 993 | auto-send + reply detection, over hand-rolled TLS sockets |
| Cloudflare Workers AI | fit check, JD parse, footprint, diligence, draft, screening prep |

## 4. Module inventory

| Module | Functions / role |
| --- | --- |
| `src/index.js` | 3 handlers, all HTTP routes, `statusReport`, `probeMail`, `syncStagesFromNotion`, `backfillNotion/JD/Diligence/Footprints/Screen`, `openDiscussions`, `watchRows`, `prepareScreen` |
| `src/pipeline.js` | `processLead` (the core), `runPipeline`, `processPending`, `pullSources`, `pollFresh`, `pollWatch`, `discoverWatch`, `sourcesForHour`, `sourceForHour`, `normaliseLinkedIn`, `watchContext` |
| `src/db.js` | `getProfile`, `updateProfile`, `insertLead(s)`, `getLead`, `pendingLeads`, `updateLead`, `commitLead`, `setStage`, `listDrafts`, `listLeads`, `stats`, `autoCandidates`, `dueSends`, `sentLast24h`, `markSent`, `watchList`, `seenUids`, `listReplies`, `flagFollowups` |
| `src/llm.js` | `textOf`, `modelFor`, `complete`, `parseWithAI`, `parseFit`, `fitCheck`, `PARSE_SCHEMA`, `FIT_SCHEMA`, `DRAFT_SCHEMA` |
| `src/core/parse.js` | `clean`, `parseListing`, `stripHtml` |
| `src/core/score.js` | `scoreLead`, `DEFAULT_WEIGHTS` |
| `src/core/draft.js` | `pickProofPoints`, `chooseAngle`, `buildPrompt`, `templateDraft`, `parseLlmJson` |
| `src/core/diligence.js` | `diligencePrompt`, `formatDiligence`, `buildDiligence`, `NICHES` |
| `src/core/footprint.js` | `companyUrlFor`, `findCompanySite`, `fetchSite`, `formatFootprint`, `buildFootprint`, `FOOTPRINT_SCHEMA` |
| `src/core/signals.js` | `bingHits`, `hiringVelocity`, `buildSignals` |
| `src/core/screen.js` | `screenPrompt`, `formatScreen`, `buildScreenPrep`, `SCREEN_SCHEMA` |
| `src/core/contacts.js` | `contacts`, `FREEMAIL`, `domainOf`, `isEmail` |
| `src/sources/base.js` | `anyWord`, `candidate`, `matches`, `makeQuery`, `getJson`, `isoDate` |
| `src/sources/registry.js` | `ADAPTERS`, `enabledSources` |
| `src/sources/hn.js` | `latestThreadId`, `toCandidate`, `fetchHN` |
| `src/sources/yc.js` | `newestBatches`, `toCandidate`, `fetchYC` |
| `src/sources/boards.js` | `fetchRemoteOK`, `fetchJobicy`, `fetchJobsPipe`, `fetchRemotive`, `fetchArbeitnow`, `fetchHimalayas` |
| `src/sources/ats.js` | `ATS_URL`, `listAts`, `parseAts`, `fetchAts`, `detectAts` |
| `src/sources/fresh.js` | `getMeta`, `setMeta`, `freshHN`, `freshRemoteOK`, `freshRemotive` |
| `src/mail/socket.js` | `openSocket` — line-oriented TLS socket over `cloudflare:sockets` |
| `src/mail/smtp.js` | `buildMessage`, `newMessageId`, `sendMail` |
| `src/mail/imap.js` | `searchInbox`, `parseFetch`, `decodeTextPart`, `snippetOf`, `header`, `addressOf` |
| `src/mail/policy.js` | `approvePending`, `approveLead`, `cancelLead`, `sendDue`, `replyQuery`, `matchLead`, `scanReplies`, `mailTick`, `backfillContacts`, `mailStatus` |
| `src/mail/status.js` | `mailEnabled`, `autoConfig`, `autoStatusLine` |
| `src/notion.js` | `cleanToken`, `notionEnabled`, `leadToProps`, `ensureSchema`, `appendJD`, `syncLead`, `commentOnCard`, `discussionBrief`, `pageStage`, `pullStages` |
| `src/ui.js` | `page`, `dashboard`, `addForm`, `leadDetail`, `profileForm`, `watchPage`, `repliesPage`, `replyCard`, `contacts`, `esc` |

### Notable pure functions worth reusing

- `scoreLead(text, opts)` → `[score 0-100, breakdown]`; weights `stack 30 / role 20 / stage 15 /
  remote 15 / freshness 10 / llm 10`, fully overridable per profile.
- `parseListing(raw)` → title, company, location, remote, stage, team size, posted date, kind.
- `pickProofPoints(text, proofPoints, n)` → tag-hit ranking.
- `deduplicateJobs` logic is simple: unique index on `source_url`.
- `hiringVelocity(snapshots)` → `delta open roles / days / polls`.
- `detectAts(text)` → `{ats, slug}` from any URL or post body.

## 5. Data model (D1)

| Table | Key columns |
| --- | --- |
| `profile` | single row, `id = 1`: name, headline, skills, target_titles, calendar_link, weights |
| `proof_point` | title, body, tags — the evidence every draft may cite |
| `lead` | source, source_url (unique index), raw_text, kind, company, title, location, remote, company_stage, team_size, posted_at, score, score_breakdown, llm_fit, llm_reason, stage, stage_changed_at, needs_followup, next_action_at, notes, error, notion_page_id, company_url, footprint, diligence, niche, signals, screen_prep, contact_email, auto_status, approved_at, auto_send_at, sent_at, send_attempts, sent_message_id, reply_snippet, replied_at, closed_at, notion_jd, notion_discussed |
| `draft` | lead_id, angle, subject, body, approved, sent_at, message_id |
| `stage_event` | lead_id, stage, at — append-only history |
| `meta` | k/v cursors (`fresh_since`, `hn_thread`) |
| `mail_seen` | uid PK — dedupes inbox scans |
| `watch` | company, ats, slug (unique), enabled, last_polled, last_status, jobs_seen, note |
| `watch_snapshot` | watch_id, polled_at, total_jobs, matched — hiring velocity |

Stages: `new → scored → drafted → sent → replied → screening → interview → offer → closed`.

## 6. The pipeline, per lead (`processLead`)

1. **Ingest** — if only a URL was pasted, fetch the page text (LinkedIn guest view); detect login wall.
2. **Parse** — `parseListing` (rules). If title/company missing, one cheap-model parse call.
3. **Footprint** — find the company's own site (YC `website`, else first non-board link, else Bing RSS),
   fetch it once, summarise with the model. Cached on the lead; never refetched.
4. **Score** — rules first. Above `SCORE_LLM_THRESHOLD` (40) the model adds a 0-10 fit. A fit `<= 2`
   **vetoes** the draft and caps the score at threshold-1 (stops keyword luck on multi-role posts).
5. **Diligence** — one model call: niche, stated/implied pain points with evidence, positioning,
   proof to cite, evidence to bring, risks, first ask.
6. **Signals** — 2 Bing searches (freelance-marketplace footprint, funding/press) + watchlist
   hiring velocity + role closures.
7. **Draft** — one model call, 90-140 words, JSON schema, max two proof points. Falls back to
   `templateDraft()` on any AI failure so the lead is never lost.
8. **Notion** — one create/update, page body written on create.
9. **Commit** — all fields + stage events + draft in **one D1 batch**.

Warnings are accumulated into `lead.error` (a diagnostics field, not just failures).

## 7. The 5 crons

| Cron | Work |
| --- | --- |
| `* * * * *` | `pollFresh` — new HN comments + newest RemoteOK/Remotive since the cursor; processed on the spot |
| `0 */6 * * *` | `pullSources` — 2 rotating sources + poll 4 watchlist companies |
| `*/10 * * * *` | `processPending` — drain `PROCESS_BATCH` (4) new leads |
| `15 * * * *` | `mailTick` — approve → send due → scan replies |
| `30 * * * *` | housekeeping — follow-up flags, watchlist discovery, footprint/diligence/screen backfills, Notion stage sync + discussions |

## 8. Auto-send policy (`src/mail/policy.js`)

Thresholds: score `>= 65`, fit `>= 7`. Queue → Notion **Approved** column with a 24 h hold →
send from Gmail → scan IMAP for replies. `AUTO_SEND_PER_TICK` 5, `AUTO_SEND_DAILY_CAP` 10,
`REPLY_SCAN_DAYS` 14, 3 retries then `failed`.

The board is the **veto switch**: `sendDue` re-reads the card before every send; a card not in
`Approved` is marked `vetoed` and never emailed. Dragging a card *into* `Approved` queues it.

## 9. Notion sync

Board columns: `New / Scored / Draft ready / Approved / Sent / Replied / Interview / Won / Lost`.
Properties: Name, Company, Stage, Type, Source, Score, Link, Lead ID, Draft, Interview, Notes,
Contact, Auto-send at, Reply, Replied at, Footprint, Website, Due diligence, Niche, Signals.

`syncStagesFromNotion` polls edits since 2 h ago and pulls column moves back into D1 — the board
and D1 are bidirectional, with the board as the source of truth for the send decision.

Optional properties are dropped on retry when the board predates them (`missingProp`).

## 10. Tests

39 tests across 6 files, all green. `test/helpers/d1.js` is a faithful D1 shim over
`node:sqlite` that applies every migration and **counts round trips like Cloudflare bills
subrequests** — which is how the "4 D1 calls per lead" budget is enforced.

## 11. What is genuinely good here

- **Budget-aware design** — the 50-subrequest/10ms discipline is real and tested.
- **Graceful degradation** — every AI call has a template fallback; every external failure lands in
  `lead.error` instead of killing the run.
- **Veto fit** — a cheap model "no" beats keyword luck.
- **Board-as-veto** — the human decision is the control surface, and it is enforced server-side.
- **Backfills** — every new feature has an idempotent catch-up pass for existing rows.
- **Dedupe at the DB** — unique index on `source_url`, plus `mail_seen` for inbox scans.

## 12. What does not transfer to Relay

- `cloudflare:sockets` SMTP/IMAP — Relay is Next.js on Vercel/Node; use `nodemailer` + `imapflow`.
- D1 batching and subrequest budgeting — Supabase/Postgres has no such limit.
- Cron rotation to stay under 50 subrequests — Relay can pull many sources per run.
- The whole "one source per run" constraint is gone. That is the single biggest unlock.

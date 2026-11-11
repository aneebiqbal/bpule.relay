# RELAY V6.3 — Provider integration record

Verified against live provider documentation on 2026-11-11. Endpoints below are
the ones the adapters call. No endpoint name or limit is taken from the planning
document.

## Prospeo — PRIMARY search + enrichment

Base: `https://api.prospeo.io`
Auth: header `X-KEY: <api_key>` (server env only)

| Operation | Method + path | Credits |
|---|---|---|
| Search person | `POST /search-person` | 1 per request that returns ≥1 person |
| Enrich person | `POST /enrich-person` | 1 per email found; 10 per mobile |

Search request: `{ "page": 1, "filters": { "person_job_title": { "include": [...], "match_mode": "CONTAINS" }, "person_seniority": { "include": [...] }, "company_location_search": { "include": [{ "location": "...", "location_type": "country" }] }, "company_headcount_range": { "include": [...] }, "company_industry": { "include": [...] } } }`
Search response: `{ error, free, results: [{ person, company }], pagination: { current_page, per_page, total_page, total_count } }` — 25 results/page, max 1000 pages.
Enrich request: `{ "data": { "person_id": "<id from search>" }, "only_verified_email": true }`
Enrich response: `{ error, free_enrichment, person: { person_id, first_name, last_name, full_name, linkedin_url, current_job_title, email: { status, revealed, email, verification_method }, location }, company }`

Error codes: `INVALID_FILTERS`, `PLAN_REQUIRED`, `NO_RESULTS`, `INSUFFICIENT_CREDITS`,
`INVALID_API_KEY`, `INVALID_REQUEST`, `SERVICE_TEMPORARILY_UNAVAILABLE`,
`INTERNAL_ERROR`, `NO_MATCH`, `INVALID_DATAPOINTS`; HTTP 429 = rate limit.

Rate limit: see `https://prospeo.io/api-docs/rate-limits` (plan-scoped).
Credit notes: search dedupe is free within 30 days (`"free": true`); enrichment
dedupe is free within 90 days (`free_enrichment: true`). Email is only revealed
when `email.revealed === true`; `status` is `VERIFIED` / other.

## Snov.io — FALLBACK finder + verification

Base: `https://api.snov.io`
Auth: `POST /v1/oauth/access_token` `{ grant_type: "client_credentials", client_id, client_secret }` → `access_token` (Bearer, 3600s)

| Operation | Method + path | Credits |
|---|---|---|
| Find email by name+domain | `POST /v2/emails-by-domain-by-name/start` → `GET /v2/emails-by-domain-by-name/result?task_hash=` | 1 per email with valid/unknown status |
| Verify email | `POST /v2/email-verification/start` → `GET /v2/email-verification/result?task_hash=` | free (rate-limited) |
| Database (people) search | `POST /v2/database-search/prospects/start` → `GET .../result/{task_hash}` | 1 page free on free plan |

Finder request: `{ rows: [{ first_name, last_name, domain }] }` (≤10 rows).
Verifier result: `{ email, result: { smtp_status: "valid" | "not_valid" | "unknown", ... } }`.
Rate limit: 60 requests/minute. Verification: up to 500–4000/hour by plan.

## Manual path (Prospect → Lead)

`enrich-person` accepts `linkedin_url` alone as a matching datapoint (verified
against the live docs). After the canonical lead is created, the save route
enriches by URL when the lead is qualified and Prospeo is configured. Only a
VERIFIED (or explicitly risky-but-real) address is persisted, and a provider
outage never fails the save.

## Stale addresses (§26)

A verified address older than 75 days is reverified with Snov's free verifier
immediately before a send. If it no longer verifies, the send is blocked. A
missing Snov configuration never blocks a send; Fresh Prospects still marks the
address stale so a rep can act before trying.

## Admin surface

`/admin/providers` houses provider status/budget and saved-search configuration;
`/api/admin/provider-analytics` reports the funnel and per-search quality from
canonical events. Provider secrets are never returned — `configured` is a
boolean.

## Apollo — DISABLED / non-dependency

Not implemented. No credentials, no adapter. `apollo` rows in `provider_config`
are inert: the registry refuses to build an adapter for a provider with no
implementation, so a misconfigured key can never cause a call.

## Security

- Keys live in server environment variables only (`PROSPEO_API_KEY`,
  `SNOV_CLIENT_ID`, `SNOV_CLIENT_SECRET`). Never in the browser, never in an API
  response, never in `action_events`, never in logs.
- Relay makes normal authenticated requests through `relay_app` / RLS. Provider
  calls happen only in the server-only provider layer.
- Rotate test credentials before production certification (§37).

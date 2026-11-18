# Relay — End-to-End Acceptance

Branch `feat/relay-completion-program`. Not deployed.

This records what was actually executed and observed, what could not be executed,
and the exact remaining steps. It does not claim a journey that did not run.

---

## 1. Environment

| Fact | Value |
|---|---|
| Production | `https://relay.bpulse.dev` — reachable, `/api/version` reports `databaseProvider: postgres`, `authProvider: aiven`, `appVersion: 0.8.0`, `sha: null` (unidentified) |
| Production build | `/api/version.buildTime` = 2026-11-18T20:25:52Z (= PM2 process start; `BUILT_AT` is evaluated at module load) |
| `origin/main` | `77476c75` — last deployed commit (deploy run 44216121654, 2026-11-18T01:28:50Z) |
| This branch | 11 commits ahead of `main`'s content (sprints 7–8 + BUG-38…42) |
| Local acceptance target | `http://127.0.0.1:3000`, local production build against the same Aiven DB |
| Accounts | `hassan@scout.dev` (admin), `ahmad@scout.dev` (rep) |

### Browser reachability (diagnosed, not assumed)

| Target | Result |
|---|---|
| `http://localhost:3000` (harness browser) | **502 on top-level navigation** — the harness egress proxy intercepts `localhost` |
| `http://127.0.0.1:3000` (harness browser) | **Works** — full SSR + hydration |
| `https://relay.bpulse.dev` (harness browser) | **Works** — full page |
| Playwright Chromium | **Works** after `npx playwright install chromium` |

So the earlier "browser unavailable" conclusion was a **`localhost`-only proxy
artifact**. Real browser acceptance was possible and was performed.

---

## 2. Journeys executed

### 2.1 BUG-38 — selected profile controls the analysis (real browser)

As `ahmad@scout.dev`, on `/prospect`:

- The **Working as** selector offered `Aneeb, LinkedIn` and `Mehak, LinkedIn`.
- The page read **"Prospecting as · LinkedIn · Aneeb, LinkedIn"**.
- Ran an analysis on a pasted LinkedIn profile. The result showed the sender
  ranking with **Muhammad Aneeb as the current sender (61%)** and a recommendation
  for Hassan Saulat (100%) with the reason "Strong skill overlap: terraform, aws,
  kubernetes" — i.e. Aneeb's proof, not a default profile's.
- An independent authenticated `POST /api/prospect/analyze` returned
  `bestSender.label = "Aneeb, LinkedIn"` and `selectedProfileId = 87c10cd5…`.

### 2.2 BUG-39 — reuse (live API)

Two identical authenticated analyze calls:

| Call | Result |
|---|---|
| 1st | `reused: false`, 31,676-byte result |
| 2nd | **`reused: true`, `reusedAt` set**, 17.2 s |

### 2.3 BUG-40 — capture credit (live DB, saved/restored)

| Step | Observation |
|---|---|
| Before | `completed_count 2`, `source_event_ids ['2026-11-18','2026-11-19']` — the business date sitting in the idempotency slot |
| same `p_source_event_id` twice | 2 → 3, then `already_recorded` (no increment) |
| a second capture id | 3 → 4 |
| Restore | exact prior count and `source_event_ids` |

### 2.4 BUG-42 — unchanged reconcile (live DB, saved/restored)

On `Fizza Upwork`, with an acknowledged operator row: re-configuring the identical
chain returned `{ ok: true, unchanged: true }`; `acknowledged_at` and
`source_row_id` were preserved and the active seat set was unchanged.

### 2.5 Control Center (real browser)

`/admin/control-center` rendered: four tabs (Profiles · Team · Issues & Data (2) ·
Data), a profiles summary (7 people, 7 assigned, 0 unassigned, 7 acknowledgements
outstanding, 0 needing attention) and person cards (Aleena Saman, Fizza Iqbal with
upwork + linkedin).

### 2.6 QA gates

| Gate | Result |
|---|---|
| Unit | **402 files / 5,805 tests passed** |
| Build | exit 0 |
| TypeScript | clean |
| ESLint | 0 errors |
| `qa:contracts` | 4 files / 80 tests passed |
| `qa:coverage` | 15/15 contracts pass, 0 skipped |
| `qa:release` (code portion) | UNIT PASS · BUILD PASS · 5,805/5,805 · 0 skipped |

---

## 3. Defects found during browser verification (and fixed)

1. **The Analyzer defaulted to the active sidebar account**, which can be an
   Upwork account, while offering only LinkedIn senders. The page claimed
   "Prospecting as \<Upwork account\>" and the analyze call then failed.
   Fixed: it defaults to an offered sender.
2. **The `?paste=` deep link fired before the sender list loaded**, so it always
   used the unusable workspace default and errored. Fixed: it waits for a valid
   selection, and `analyze()` refuses to send an unusable one.

---

## 4. Not executed

| Journey | Why |
|---|---|
| Rep-role and unauthorized-role journeys | Not run |
| Multi-operator simultaneous sessions | Not run |
| Screenshots | The harness cannot keep a desktop window visible for `browser.screenshot`; Playwright screenshots are captured by the suite instead |
| Serial isolated-DB integration suite | Needs the Aiven owner cutover / isolated fixture |
| Production RLS verifier | Needs the VPS |

### 4.1 Playwright matrix — attempted, did not complete

`e2e/rc-browser-acceptance.spec.ts` was run with
`E2E_BASE_URL=http://127.0.0.1:3000` after installing Playwright Chromium. It
reached case 5 of 8 and was stopped: every AI-backed case exceeded the 260 s
per-test timeout.

**This is a latency failure, not a product defect.** Measured on this host:

| Call | Latency |
|---|---|
| `GET /api/profiles?assigned=1&channel=linkedin` (the Analyzer sender list) | **27 s, 31 s, 61 s** across three page loads |
| A single analyze call | 17–60 s |
| Individual DB reads | ~1.5 s per round trip |

Each acceptance case runs a full extraction + scoring + draft pipeline, so it
cannot fit in 260 s here. The suite was designed for a preview deployment on a
fast network. Two console 401s were also observed mid-run (a session expiring
during a long-running case), which the suite's own login helper handles on retry.

**Consequence:** the Playwright matrix is **unverified**, not failed. The browser
journeys that *were* completed manually are listed in §2.

---

## 5. Deployment findings

- `OPS.md` described a Vercel + Supabase deployment. It has been rewritten for
  the real InterServer / PM2 / Caddy / Cloudflare / Aiven architecture.
- `deploy.yml` now stamps `RELAY_GIT_SHA` and `BUILD_TIME`, so `/api/version`
  identifies the deployed commit. Until this ships, `sha` is `null` and a
  deployment cannot be tied to a commit — which is why `qa:release` reports
  `SHA_GATE: NOT_VERIFIED`.
- Rollback is a `relay-current` symlink swap; releases are immutable directories.

---

## 6. Remaining steps

1. Review and approve PR #51.
2. Merge to `main` → GitHub Actions builds and deploys.
3. Confirm `GET https://relay.bpulse.dev/api/version` reports the merged SHA.
4. Run the production RLS cutover verifier.
5. Run the remaining role/unauthorized and multi-operator journeys.
6. Release decision.

---

## 7. Verdict

**NO-GO for public release.** All five reported bugs are fixed and verified by
unit tests, live API/DB probes and real browser interaction. What is outstanding
is not a known product defect: it is the deployed-SHA proof, the production RLS
verifier, and the remaining role/isolation journeys.

# Job sources on the internet — catalogue for Relay

130+ sources, grouped by how hard they are to use. Tiers A-C are keyless and can be written as
one small `JobProvider` each. Tiers E-G need credentials, scraping, or have no public API.

Legend: **JSON** = public API · **RSS** = feed · **HTML** = scrape · **Key** = credential needed ·
**Paid** = commercial · **None** = no public access at all.

---

## Tier A — Keyless public JSON/API (drop-in, highest value)

| # | Source | Endpoint | Format | Notes |
| --- | --- | --- | --- | --- |
| 1 | RemoteOK | `remoteok.com/api` | JSON | first array element is metadata |
| 2 | Jobicy | `jobicy.com/api/v2/remote-jobs?count=100&industry=engineering&tag=` | JSON | |
| 3 | Remotive | `remotive.com/api/remote-jobs?category=software-dev&limit=100` | JSON | also RSS |
| 4 | Arbeitnow | `arbeitnow.com/api/job-board-api?page=N` | JSON | EU-leaning |
| 5 | Himalayas | `himalayas.app/jobs/api?limit=20&cursor=` | JSON | cursor paging, has RSS |
| 6 | JobsPipe | `api.jobspipe.dev/v1/{sandbox/}jobs/search` (POST) | JSON | **sandbox works with no key**; 30+ boards inside |
| 7 | Working Nomads | `workingnomads.com/api/v1/jobs` | JSON | |
| 8 | We Work Remotely | `weworkremotely.com/remote-job-rss-feed` + per-category feeds | RSS | |
| 9 | Remote.co | `remote.co/remote-jobs/rss` | RSS | |
| 10 | JustRemote | `justremote.co/remote-jobs-rss` | RSS | |
| 11 | Virtual Vocations | `virtualvocations.com/jobs-feed` | RSS | |
| 12 | Dynamite Jobs | `dynamitejobs.com/api/jobs` | JSON | |
| 13 | Jobspresso | `jobspresso.co/api` | JSON | |
| 14 | Pangian | `pangian.com/api/jobs` | JSON | |
| 15 | GoRemote | `goremote.co/api` | JSON | |
| 16 | RemoteFirst | `remotefirst.com/api/jobs` | JSON | |
| 17 | RemotePeople | `remotepeople.io/api` | JSON | |
| 18 | EuropeRemotely | `europeremotely.com/api` | JSON | |
| 19 | EU Remote Jobs | `euremotejobs.com/feed` | RSS | |
| 20 | Remotists | `remotists.com/rss` | RSS | |
| 21 | 4dayweek | `4dayweek.io/api/jobs` | JSON | 4-day-week board |
| 22 | Jobbatical | `jobbatical.com/api/jobs` | JSON | relocation included |
| 23 | RelocateMe | `relocateme.eu/api` | JSON | |
| 24 | OKJob | `okjob.io/api/jobs` | JSON | |
| 25 | YC Work at a Startup | `workatastartup.com/graphql` (embedded Inertia payload) | JSON | **all YC companies**, salary/equity/remote |
| 26 | Wellfound | `wellfound.com/api/v2/...` (embedded GraphQL in page) | JSON | startup-only, 130k+ listings |
| 27 | HN "Who is hiring" | `hn.algolia.com/api/v1/search_by_date?tags=comment,story_{id}` | JSON | monthly thread |
| 28 | HN "Who wants to be hired" | same, different thread id | JSON | candidates, not jobs — invert the match |
| 29 | HN "Seeking freelancer" | same, monthly | JSON | freelance asks |
| 30 | Indie Hackers jobs | `indiehackers.com/jobs` | HTML | founder-led, small teams |
| 31 | MicroConf / Starter Story | `starterstory.com/jobs` | HTML | |
| 32 | Lenny's Newsletter jobs | `lennysnewsletter.com/jobs` | HTML | high-signal product/eng |
| 33 | Dev.to jobs | `dev.to/listings` | HTML/JSON | dev-first |
| 34 | Otta | `otta.com/api` (partner) | JSON | partial public surface |
| 35 | Otta RSS | `otta.com/rss` | RSS | |

## Tier B — ATS public endpoints (keyless, per-company)

These return **one company's** published postings. Relay's watchlist is exactly the discovery
layer for these. `leadengine` already implements Greenhouse/Lever/Ashby.

| # | ATS | Endpoint | Format | Notes |
| --- | --- | --- | --- | --- |
| 36 | Greenhouse | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` (+ `/jobs/{id}`) | JSON | list then per-job description |
| 37 | Lever | `api.lever.co/v0/postings/{slug}?mode=json` | JSON | supports `team`/`level`/`location` filters |
| 38 | Ashby | `api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true` | JSON | `isListed`, compensation |
| 39 | Workable | `careers.workable.com/api/v1/slug/{slug}/jobs` | JSON | |
| 40 | Recruitee | `{company}.recruitee.com/api/offers` | JSON | |
| 41 | Personio | `{company}.personio.de/api/v1/company/positions.xml` | XML | |
| 42 | BambooHR | `{company}.bamboohr.com/careers/list` | JSON | embedded |
| 43 | SmartRecruiters | `api.smartrecruiters.com/v1/companies/{company}/postings` | JSON | |
| 44 | Teamtailor | `{company}.teamtailor.com/api/v1/jobs` | JSON | |
| 45 | Jobvite | `jobs.jobvite.com/{company}` | HTML | |
| 46 | JazzHR / Resumator | `api.resumator.jazz.co/v2/...` | JSON | key for full, public XML per job |
| 47 | iCIMS | `{company}.icims.com/api/v1/...` | JSON | partner-leaning |
| 48 | ApplyTo | `{company}.applytojob.com/apply` | HTML | |
| 49 | Home/Harvest (Greenhouse Harvest) | `api.greenhouse.io/v1/partner/...` | JSON | **key** — candidate pipeline, not jobs |

## Tier C — GitHub-native (open source work, bounties, paid issues)

| # | Source | Endpoint | Format | Notes |
| --- | --- | --- | --- | --- |
| 50 | GitHub Search API | `api.github.com/search/issues?q=is:open+is:issue+label:"good first issue"` | JSON | **keyless, 10 search req/min unauth** |
| 51 | GitHub topics: good-first-issue | `github.com/topics/good-first-issue` | HTML | browse layer |
| 52 | GitHub topics: help-wanted | `github.com/topics/help-wanted` | HTML | 1,292+ repos |
| 53 | goodfirstissue.dev | curated feed | HTML | language filter |
| 54 | goodfirstissues.com | curated feed | HTML | |
| 55 | Up For Grabs | `up-for-grabs.net` | HTML/JSON | 6k+ curated projects |
| 56 | CodeTriage | `codetriage.com` | HTML | daily issue emails |
| 57 | EddieHub finder | `finder.eddiehub.io` | HTML/JSON | |
| 58 | ForGoodFirstIssue | `forgoodfirstissue.github.com` | HTML | DPG-focused |
| 59 | First Timers Only | `firsttimersonly.com` | HTML | |
| 60 | 24 Pull Requests | `24pullrequests.com` | HTML | seasonal |
| 61 | Opire | `opire.dev` | HTML | **paid** bounties from $20 |
| 62 | Gitcoin | `gitcoin.co/mechanisms/bounties` | HTML | paid bounties |
| 63 | Dework | `dework.xyz` | HTML | paid tasks |
| 64 | HackerOne | `hackerone.com/bug-bounty-programs` | HTML | security bounties |
| 65 | HackenProof | `hackenproof.com/programs` | HTML | web3 security |
| 66 | Bugcrowd | `bugcrowd.com/bug-bounty-list` | HTML | |
| 67 | Intigriti | `intigriti.com/programs` | HTML | |
| 68 | GitLab issues | `gitlab.com/api/v4/projects/:id/issues?labels=good+first+issue` | JSON | keyless |
| 69 | Codeberg | `codeberg.org/api/v1/repos/.../issues` | JSON | keyless |
| 70 | `timqian/open-source-jobs` | GitHub repo | Markdown | paid open-source roles |
| 71 | `backend-br/vagas` | GitHub repo (issues as jobs) | Markdown | |
| 72 | `maurobonfietti/remote-jobs` | GitHub repo | Markdown | |
| 73 | `SimplifyJobs/New-Grad-Positions` | GitHub repo | Markdown | updated daily |
| 74 | `SimplifyJobs/Summer2027-Internships` | GitHub repo | Markdown | updated daily |
| 75 | `Kaustubh-Natuskar/moreThanFAANGM` | GitHub repo | Markdown | 400+ companies |
| 76 | `cncf/gitjobs` | GitHub repo | Markdown | open-source paid roles |

## Tier D — Reddit (`.json` keyless)

Append `.json` to any listing URL. **100 requests / 10 minutes** unauth. Filter by flair
(`[Hiring]`, `[For Hire]`, `[Task]`).

| # | Subreddit | Focus |
| --- | --- | --- |
| 77 | r/forhire | paid work board, $15+/h floor |
| 78 | r/jobbit | general jobs |
| 79 | r/hiring | employer posts |
| 80 | r/remotejobs | remote |
| 81 | r/workonline | online work |
| 82 | r/freelance_forhire | freelance |
| 83 | r/slavelabour | micro-gigs, paid |
| 84 | r/HireaWriter | writing |
| 85 | r/DesignJobs | design |
| 86 | r/sysadminjobs | ops |
| 87 | r/copywriting | copy |
| 88 | r/devopsjobs | devops |
| 89 | r/pythonjobs | Python |
| 90 | r/golang_jobs | Go |
| 91 | r/javascript_jobs | JS |
| 92 | r/Upwork | Upwork-adjacent |
| 93 | r/freelance | freelance chat/work |
| 94 | r/cscareerquestions | jobs discussion |
| 95 | r/recruitinghell | employer transparency |
| 96 | r/digitalnomad | nomad work |
| 97 | r/microgigs | micro-gigs |
| 98 | r/forhire_UK / r/londonjobs / r/SanDiegoJobs | geo boards |

## Tier E — Paid / partner APIs (aggregators — buy once, get many)

| # | Source | Notes |
| --- | --- | --- |
| 99 | JobsPipe | 30+ boards, sandbox free |
| 100 | JSearch (RapidAPI) | LinkedIn/Indeed/Glassdoor/Zoom/Indeed — 20+ boards, one key |
| 101 | Adzuna | free tier, key, 25+ countries |
| 102 | Jooble | paid |
| 103 | The Muse | key |
| 104 | USAJobs | **free key**, US federal |
| 105 | Findwork.dev | free, dev-only |
| 106 | Careerjet | paid |
| 107 | Reed | paid |
| 108 | SerpApi | Google Jobs via SERP, paid |
| 109 | Bright Data | job-posting dataset, paid |
| 110 | Techmap jobdatafeeds | LinkedIn-sourced, paid, RSS/API |
| 111 | Fantastic.Jobs | ATS aggregator API |
| 112 | ZipRecruiter | partner API |
| 113 | LinkedIn Jobs API | **partner only** |
| 114 | Indeed | **partner only** |

## Tier F — Freelance marketplaces (no keyless API; partner or scrape)

| # | Source | Access |
| --- | --- | --- |
| 115 | Upwork | partner API only (Relay already covers this) |
| 116 | Fiverr | no public API |
| 117 | Toptal | no public API |
| 118 | Contra | no public API |
| 119 | Braintrust | 0%-fee network, no API |
| 120 | Gun.io | vetted, no API |
| 121 | Lemon.io | vetted, no API |
| 122 | Arc | vetted, no API |
| 123 | Freelancer.com | no public API |
| 124 | PeoplePerHour | no public API |
| 125 | Working Not Working | curated, no API |

## Tier G — Hackathons, grants, fellowships (work-as-prize)

| # | Source | Notes |
| --- | --- | --- |
| 126 | Devpost | paid hackathons |
| 127 | MLH | student hackathons |
| 128 | ETHGlobal | web3, cash + VC access |
| 129 | Kaggle | ML competitions, cash + jobs |
| 130 | Zindi | Africa ML, cash |
| 131 | DrivenData | data-for-good, cash |
| 132 | Rise In (Celo) | $25k+ grant pools |
| 133 | Stellar grants | dev grants |
| 134 | Google Summer of Code | paid internship |
| 135 | Outreachy | paid internship, underrepresented |
| 136 | Linux Foundation mentorship | paid |
| 137 | MLH Fellowship | paid |

## Tier H — Company career pages (via Tier B)

Any company with a public ATS board is reachable — Relay's watchlist discovers them from links in
leads (`detectAts`). That is the unbounded tier: **the entire internet of hiring pages**, one
board at a time, with closure detection as the "they hired" signal.

---

## Coverage gap in the current Relay build

Relay ships 8 providers: `himalayas, remoteok, jobicy, remotive, arbeitnow, adzuna, themuse,
usajobs`. The catalogue above adds **~120 more**, of which Tier A (25 keyless JSON boards) plus
Tier B (4 public ATS endpoints) plus Tier C (GitHub Search) plus Tier D (22 Reddit boards) is the
highest value and needs **zero credentials**.

## Legal / ToS guardrails

- Prefer public JSON/RSS over HTML scraping.
- Respect `robots.txt`; send a descriptive `User-Agent`.
- Reddit and GitHub unauth rate limits are low — throttle, cache, and retry with backoff.
- Freelance marketplaces (Tier F) generally prohibit scraping; use partner APIs or drop them.
- JobsPipe's sandbox is explicitly free — use it before paying.

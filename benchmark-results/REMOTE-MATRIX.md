# Remote Eligibility Matrix — Relay Intelligence Benchmark

## Operating Context

**bpulse operates from Pakistan** and pursues:
- International remote work
- Freelance projects
- Clients worldwide

Company location MUST be separate from worker eligibility.

A company in Germany hiring remotely IS eligible for a Pakistan-based worker.
A company in the US with "US only" restriction is NOT eligible.
A company with hybrid London requirements is NOT eligible for a fully remote Pakistan-based worker.

---

## Test Cases

### Tier 1: Fully Remote (Eligible)

| ID | Scenario | Expected | Why |
|----|----------|----------|-----|
| RW-001 | "Remote (Worldwide)" company | `worldwide` | Explicit worldwide policy |
| RW-002 | "Work from anywhere" in job description | `worldwide` | No geographic restriction |
| RW-003 | "Fully remote" + async-friendly | `worldwide` | Async implies timezone-agnostic |
| RW-004 | Upwork job with no location mentioned | `worldwide` | Upwork = inherently remote |
| RW-005 | "Remote, EU/US timezones OK" | `worldwide_with_tz_overlap` | Remote but timezone preference (still eligible) |
| RW-006 | "Remote but occasional office visits" | `remote_with_occasional_travel` | Mostly remote, travel required |
| RW-007 | Freelance project, no workplace wording | `worldwide` | Freelance = no workplace |
| RW-008 | Founder seeking contractor globally | `worldwide` | "Globally" = no restriction |

### Tier 2: Region-Restricted Remote (Conditionally Eligible)

| ID | Scenario | Expected | Why |
|----|----------|----------|-----|
| RR-001 | "Remote, US only" (compliance) | `us_only` | Explicit US restriction |
| RR-002 | "Must be based in EU/EEA" (GDPR) | `eu_only` | Explicit EU restriction |
| RR-003 | "Remote, UK only" (tax reasons) | `uk_only` | Explicit UK restriction |
| RR-004 | "Remote, EMEA timezones" | `emea` | Timezone-based restriction |
| RR-005 | "Remote, Europe only" | `europe_only` | Geographic restriction |
| RR-006 | "Must have work authorization in US" | `us_authorized` | Legal requirement |
| RR-007 | "Remote within India" | `india_only` | In-country remote |

### Tier 3: Hybrid / On-Site (Not Fully Remote)

| ID | Scenario | Expected | Why |
|----|----------|----------|-----|
| HY-001 | "Hybrid — 2 days/week in London office" | `hybrid_london` | Office requirement in specific location |
| HY-002 | "Hybrid — 3 days/week in NYC office" | `hybrid_nyc` | Office requirement in specific location |
| HY-003 | "Flexible hybrid, 1 day/month in Berlin" | `mostly_remote_berlin` | Minimal office requirement |
| OS-001 | "On-site in Manhattan, no remote" | `onsite_manhattan` | Explicitly on-site only |
| OS-002 | "On-site in Singapore" | `onsite_singapore` | Explicitly on-site only |
| OS-003 | "Based in our Tokyo office" | `onsite_tokyo` | Implied on-site |

### Tier 4: Unknown / Ambiguous

| ID | Scenario | Expected | Why |
|----|----------|----------|-----|
| UN-001 | No location mentioned at all | `unknown` | Cannot determine |
| UN-002 | "Location flexible — TBD" | `unknown` | Policy not yet set |
| UN-003 | "Competitive salary based on location" | `unknown` | Hinting at location-based pay but no restriction stated |

---

## Key Distinctions

### Company Location vs Worker Eligibility

```
Company Location: Berlin, Germany
Remote Policy: "Work from anywhere"
Worker Eligibility: WORLDWIDE (Pakistan OK)

Company Location: New York, USA
Remote Policy: "Remote within US only"
Worker Eligibility: US_ONLY (Pakistan NOT OK)

Company Location: London, UK
Remote Policy: "Hybrid, 2 days/week in office"
Worker Eligibility: HYBRID_LONDON (Pakistan NOT OK — can't commute)
```

### Why This Matters

bpulse's competitive advantage is being a high-quality, cost-effective development team based in Pakistan serving international clients. If the intelligence pipeline incorrectly marks worldwide remote opportunities as ineligible (because the company is in Europe), we miss our best opportunities.

Conversely, if we treat "US only" opportunities as worldwide, we waste effort on ineligible leads.

---

## Implementation Notes

The remote eligibility determination should:
1. Parse the raw input for remote/hybrid/onsite keywords
2. Extract any explicit geographic restrictions
3. Distinguish company location from worker requirements
4. Handle timezone preferences (not hard restrictions)
5. Default to `unknown` when no information is present
6. NEVER mark worldwide remote as ineligible just because company is abroad

---

## Test Coverage in Golden Dataset

| Case | Type | Expected Eligibility |
|------|------|---------------------|
| won-001 | LinkedIn | worldwide |
| won-002 | LinkedIn | worldwide |
| won-003 | LinkedIn | worldwide |
| won-004 | LinkedIn | worldwide |
| won-005 | Upwork | worldwide |
| won-006 | LinkedIn | worldwide |
| won-007 | LinkedIn | worldwide |
| won-008 | LinkedIn | worldwide |
| won-009 | Upwork | worldwide |
| won-010 | LinkedIn | worldwide |
| won-011 | LinkedIn | worldwide |
| won-012 | LinkedIn | worldwide |
| won-013 | LinkedIn | worldwide |
| won-014 | LinkedIn | worldwide |
| won-015 | Upwork | worldwide |
| won-016 | LinkedIn | worldwide |
| won-017 | LinkedIn | worldwide |
| won-018 | Upwork | worldwide |
| won-019 | LinkedIn | worldwide |
| won-020 | LinkedIn | worldwide |
| remote-worldwide-001 | LinkedIn | worldwide |
| remote-worldwide-002 | Upwork | worldwide |
| remote-restricted-001 | LinkedIn | us_only |
| remote-restricted-002 | Upwork | eu_only |
| remote-hybrid-001 | LinkedIn | hybrid_london |
| remote-onsite-001 | LinkedIn | onsite_manhattan |

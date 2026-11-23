# Relay — UI/UX and Accessibility

**Honest status:** no new browser pass was run in this session (no staging
environment or credentials). This file records prior evidence and the static
checks that were performed.

## 1. Prior browser evidence (carried forward)

`docs/RELAY_FINAL_BROWSER_ACCEPTANCE.md` (2026-11-23, staging, headless Chrome):

| Case | Result |
|---|---|
| Login → dashboard | ✅ |
| Jobs workspace tabs | ✅ Ready Today, Prepared, In Progress, History, Discover, Sources & Health |
| Ready Today shortlist | ✅ 5+ verified cards, candidate-fit shown |
| In Progress / History | ✅ |
| Prepared job detail | ✅ match 78/100, eligibility reasoning, suggestions |
| Screening answers panel | ✅ 3 drafts from evidence, 5 needs-human |
| Mobile 390×844 | ✅ single column |
| Midnight rollover (authed) | ✅ SUN NOV 22 → MON NOV 23, no reload/logout |
| Admin headline vs canonical API | ✅ `0 / 30 required` and `30 allocated · 0 shared unallocated · 30 tracked` |
| Work Setup journey (Admin + Rep) | ✅ assign → target 30 → acknowledge → activity → transfer → unchanged save preserves acknowledgement |

## 2. Not covered (carried)

- 20-case role matrix (Admin / Team Lead / Rep / unauthorized).
- Cross-organization denial in a browser.
- AI-failure, retry, duplicate, concurrent preparation cases.
- Screenshots for the Work Setup journey.

## 3. Static UI observations

- No `dangerouslySetInnerHTML` in the spot checks.
- Design system: `components.json`, Tailwind v4; app shell `V4AppShell`.
- Navigation is role-aware via `src/lib/navigation/relay-shell-nav.ts`, enforced
  by `tests/relay-shell-nav.test.ts`.
- Legacy nav role gating gaps recorded in `docs/RELAY_COMPLETE_ROUTE_AND_ROLE_MAP.md`
  §7.2 (`app-rail.tsx` deriving `isAdmin` from `reps.role`; command palette not
  role-filtered) were **not re-verified** in this pass and remain candidates.

## 4. Accessibility

`axe-core` is a dev dependency; prior passes ran a11y probes. Not re-run here.
Key workflows should be re-checked when a staging environment is available.

# Relay — Management UI Simplification

**Status:** implemented. The legacy per-person target editor is removed.

---

## 1. What the owner saw

| Surface | Symptom |
|---|---|
| Admin → Daily Targets | 417 actions/day, 32 targets, dozens of inline inputs, mixed owners/plans/missing targets |
| Team → Today | 405 remaining, a different total from Admin |
| Team → People | Ahmad 0/81, Madiha 0/90, zero or missing targets |
| Team → Profiles | eight tall cards, six or seven actions each, 156 on a channel |

Root cause: the screens were not reading one model. Admin Targets summed
`daily_target_plans` directly; Team Today summed personal expectations; People
and Profiles summed full lane targets per rep. Each was a different population.

## 2. Old → new

| Old | New |
|---|---|
| `TargetsManager` (`src/components/targets-manager.tsx`) | `WorkSetupManager` (`src/components/operations/work-setup.tsx`) |
| Grouped by person, one block per channel, inline pack inputs | One compact table, one row per account/channel |
| "Assign daily pack" + "custom target" + "fill missing" + advanced weights/SLAs | One drawer: primary → operators → backups → target plan → allocation → save |
| `/api/admin/targets` direct writes | `/api/admin/work-setup` single write path |
| Admin Control Center as a second management surface | Read-only drilldown + "Open Work Setup" |

## 3. The new Admin → Work Setup

Compact table columns:

`Account | Channel | Primary rep | Operators | Daily target | Allocated | Progress | Status | Issues`

Controls: search, filter by rep, filter by channel, "Needs attention" toggle.

Drawer (one save):

1. Primary rep.
2. Additional operators (chips, one seat per rep).
3. Backups (chips).
4. Daily target plan (per-activity inputs, prefilled from the channel preset or the existing lane; nothing is written until Save).
5. Allocation (only when operators exist): per-lane shares per operator, with a live `sum/target` check.
6. Save — one `POST /api/admin/work-setup`.

Filters surface the exact problems the owner named: **Unassigned**, **No target**,
**Over-allocated**, **Allocation without seat**.

## 4. People and Profiles

- Team → People stays a one-row-per-rep directory (name, role, check-in, progress,
  accounts, open tasks, overdue). It reads the same canonical numbers.
- Team → Profiles stays one-row-per-person with channels nested. Assignment and
  target editing are reachable from the profile detail, and the admin's primary
  path is Work Setup.
- Team → Today stays the executive daily screen (progress, attention, pending
  acknowledgements, overdue). Raw coverage matrices stay in the profile detail.

## 5. Design system

Work Setup uses the existing Relay primitives: `V4Panel` double-bezel,
`V4Drawer`, `V4StatStrip`, `V4Chip`, `ChannelBadge`, eyebrow labels, hairline
rings, `active:scale-[0.98]` on the primary action, and `tabular-nums` for every
figure. No new fonts, icons, borders or shadows were introduced.

## 6. Removed / redirected

- `src/components/targets-manager.tsx` — deleted.
- `/admin/targets` route kept (bookmarks resolve), now Work Setup.
- `/admin/control-center` keeps its tabs but links the primary action.
- Retired aliases remain redirects in `next.config.ts`.

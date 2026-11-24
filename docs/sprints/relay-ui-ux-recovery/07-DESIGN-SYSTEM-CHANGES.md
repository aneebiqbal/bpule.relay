# Design system and navigation changes

## Components changed

### `V4Drawer` — now an actual modal

Before: `role="dialog"` + `aria-modal="true"` with **no Escape handler, no Tab trap, no scroll
lock and no focus restoration**. Used by Work Setup, the team setup assistant and the team
assignment drawer.

After: Escape closes, focus moves into the panel, Tab/Shift+Tab cycle inside, background scroll
locks, and focus returns to the trigger on close. `onClose` is held in a ref so the effect does
not re-run (and steal focus) on every parent render.

### `Dialog` — same treatment

Added the focus trap and body scroll lock already present in `ui/drawer.tsx`, and bounded the
panel with `max-h-[90dvh] overflow-y-auto` so long dialogs cannot exceed the viewport.

### `DataTable` — per-row interactivity

Added `isRowClickable?: (row) => boolean`. Previously the presence of `onRowClick` made *every*
row focusable, cursor-pointer and Enter/Space-wired, which produced dead affordances. Used by
the recent-prospects table.

## Design-token violations noted (not changed)

Static audit found literal `shadow-xl/shadow-2xl/shadow-lg`, inline `backdrop-filter`,
`text-slate` and arbitrary `z-[80]` in `ui/dialog.tsx`, `ui/drawer.tsx`, `ui/toast.tsx` and
`v4/primitives.tsx`. These are P3 visual-consistency items; changing shared styling across every
surface without a browser design pass risks regressions, so they are logged rather than
applied blindly. `V4Drawer`/`Dialog` now match the existing drawer's behavioural contract.

## Navigation

No nav restructuring was performed. Static audit found real IA issues, recorded not acted on:

- **SR-U13**: seven primary domain links duplicate their first secondary item (e.g. Sales →
  `/leads`), and the palette reaches `/content` three times.
- Label divergence: sidebar "Sales" (`/leads`) vs Insights "Sales" (`/reports/sales`);
  "Work Setup" vs palette "Daily targets"; "Structure" vs page title "Teams".
- Active-state dead zones: `/leads/new`, `/content-v2/**`, `/studio/post-detail`,
  `/performance`, `/archive`, `/facts`, `/team/eval` resolve to a domain with no active section.
- Two competing admin control surfaces (`/admin/control-center` vs `/admin/command`) plus an
  orphaned `/admin/command-center` redirect stub.

Removing duplicates or renaming labels changes deep links people may have saved; that needs an
owner decision. `src/components/app-rail.tsx` no longer exists and its references are stale
docs/tests only.

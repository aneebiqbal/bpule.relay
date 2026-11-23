# UI / UX and design system

## Inherited and preserved

The prior sprint delivered `V4Drawer`/`Dialog` Escape, focus trap, focus restoration and scroll
lock. Those were kept; this program did not restyle anything.

## This program's UI changes (all behaviour, not styling)

| Change | Why |
|---|---|
| Work Setup conflict panel with "Load latest and re-edit" / "Discard my changes" | A 409 previously showed a bare string and discarded the committed row |
| Rep360 header/labels split into personal vs channel requirement | The mixed basis contradicted People/Team |
| Setup assistant explicit "target not written (MANAGE_TEAM_TARGETS required)" log line | A silent skip read as success |
| Upwork "Save & send" → "Log reply"; no optimistic append | The endpoint is history-only; the label was false |
| Removed `/admin/people` dead Edit control | No role editor exists |
| Removed `/team/[repId]` heatmap drilldown affordance | No drilldown exists on that surface |
| Profiles table receives the workspace-filtered set | Table density previously ignored every outer filter |

## Navigation

**Not restructured.** Static audit found real duplication (seven primary links duplicate their
first secondary item; label divergence between sidebar and palette). Removing or renaming these
changes saved deep links, so they are recorded (SR-U13) rather than changed unilaterally.
No nav entry exposed an admin tool to a non-admin.

## Design-token cleanup

Literal `shadow-xl/shadow-2xl`, inline `backdrop-filter` and `text-slate` in shared primitives
were logged, not replaced: changing shared styling across every surface without a browser design
pass risks regressions. Recorded as P3.

## Interaction quality

Silent failures were the theme of this pass: every fix either surfaces an error or stops claiming
a success. Double-submit protection already existed where it mattered (Work Setup disables Save
while saving and during a conflict).

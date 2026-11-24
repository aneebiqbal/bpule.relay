# Rep workspace and prospecting

## Fixed

| ID | Defect | Fix |
|---|---|---|
| SR-06 | "End day" hardcoded `{mode:'incomplete'}`, so a fully completed day was recorded as a shortfall. Both close controls (`rep-day-control.tsx`, `rep-coverage-panel.tsx`) now attempt `complete` first and only offer "End day anyway" when the API reports remaining required actions. | `components/coverage/*` |
| SR-10 | `/tasks` awaited optional relay-queue and suppression reads with no `.catch`; one failure replaced the task list with an error boundary. Mirrored the dashboard's fallbacks. | `app/(app)/tasks/page.tsx` |
| SR-11 | `QuickComplete` had `try/finally` but no `catch`: a 403/409 reset the button with no message. Added an inline `role="alert"` error. | `components/tasks/task-workspace-view.tsx` |
| SR-12 | Recent-prospect rows were focusable, cursor-pointer and Enter/Space-wired but only navigated when `convertedLeadId` existed. Added `DataTable.isRowClickable` and passed `Boolean(row.convertedLeadId)`. | `components/ui/data-table.tsx`, `components/prospect/prospects-workspace.tsx` |
| SR-13 | `POST /api/tasks` dropped `revenueIdentityId`, losing channel attribution on assigned tasks even though `createAssignedTask` accepts it. Forwarded. | `app/api/tasks/route.ts` |

## Reviewed and left alone (with reason)

- **Upwork send wording (SR-U1).** `upwork-communication.tsx` / `upwork-job-actions.tsx` label
  actions "Save & send" / "Follow up", append optimistically in a `catch {}`, and the routes say
  "history only". This is real, but the correct fix depends on whether Relay should ever send to
  Upwork. Relabelling to "Log reply"/"Log follow-up" plus checking `res.ok` is the safe default;
  it was not applied unilaterally.
- **`/leads/new` sender identity (SR-U2).** The API validates explicit
  `senderProfileId`/`revenueIdentityId`; the manual form sends neither and relies on the active
  workspace. Prospect Analyzer does send them. Whether manual intake should follow the active
  workspace is a product decision.
- **Daily-action self-links (SR-U12)** and the `/team/[repId]` heatmap with no drilldown
  (SR-U10): both need an agreed destination before wiring.
- **Mid-analysis sender switch (audit rep #14)** and **`apply_if_connects` visibility
  (audit rep #15)**: behaviour questions, not code defects established here.

## Verification

No rep-surface browser pass was possible (auth + populated DB required). The fixes are small,
localised and covered by the surrounding suites; `tests/task-execution-contracts.test.ts`,
`tests/task-ux-contracts.test.ts`, `tests/prospect-initial-load.test.ts` and the no-env suite
pass.

'use client'

/**
 * Admin team execution heatmap — reps × hour for the business date.
 *
 * Intensity comes from executed weighted actions (the canonical registry),
 * never logins or page views. The grid is mirrored by a visually-hidden table
 * so screen readers get the same truth, and the cell text states the number
 * rather than relying on colour alone.
 */
import { useState } from 'react'
import { cn } from 'cn'
import { V4Panel, V4PanelHeader } from '@/components/v4/primitives'
import type { TeamHeatmap } from '@/lib/performance/team-heatmap'

const HOUR_LABEL = (hour: number) => `${String(hour).padStart(2, '0')}`

export function TeamHeatmap({
  data,
  onCellClick,
}: {
  data: TeamHeatmap
  onCellClick?: (cell: { repId: string; repName: string; hour: number; count: number }) => void
}) {
  const [selected, setSelected] = useState<{ repName: string; hour: number; count: number } | null>(null)

  if (data.rows.length === 0) {
    return (
      <V4Panel>
        <V4PanelHeader eyebrow="Execution" title="Team execution heatmap" />
        <p className="mt-3 text-[12px] text-stone">No executed activity recorded today.</p>
      </V4Panel>
    )
  }

  return (
    <V4Panel>
      <V4PanelHeader
        eyebrow="Execution"
        title="Team execution heatmap"
        hint={`${data.businessDate} · ${data.timezone} · executed actions per rep per hour`}
      />

      <div className="mt-3 overflow-x-auto pb-1">
        <div className="min-w-[640px]">
          <div
            className="grid gap-px"
            style={{ gridTemplateColumns: `minmax(96px, 1fr) repeat(24, minmax(0, 1fr))` }}
            role="img"
            aria-label="Executed actions by rep and hour"
          >
            <span className="px-1 text-[10px] uppercase tracking-[0.12em] text-stone">Rep</span>
            {data.hours.map((hour) => (
              <span key={hour} className="text-center text-[10px] tabular-nums text-stone">
                {HOUR_LABEL(hour)}
              </span>
            ))}

            {data.rows.map((row) => (
              <div key={row.repId} className="contents">
                <span className="truncate px-1 text-[12px] text-ink" title={row.repName}>
                  {row.repName}
                </span>
                {data.hours.map((hour) => {
                  const count = row.cells[hour] ?? 0
                  const intensity = data.max > 0 ? count / data.max : 0
                  return (
                    <button
                      key={hour}
                      type="button"
                      onClick={() => {
                        setSelected({ repName: row.repName, hour, count })
                        onCellClick?.({ repId: row.repId, repName: row.repName, hour, count })
                      }}
                      aria-label={`${row.repName}, ${HOUR_LABEL(hour)}:00, ${count} ${count === 1 ? 'action' : 'actions'}`}
                      className={cn(
                        'h-6 rounded-sm transition-transform active:scale-[0.97]',
                        count === 0 ? 'bg-bone ring-1 ring-line/50' : 'bg-orange',
                      )}
                      style={count > 0 ? { opacity: 0.25 + intensity * 0.75 } : undefined}
                    >
                      <span className="sr-only">{count}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Accessible equivalent of the grid. */}
      <table className="sr-only">
        <caption>Executed actions by rep and hour</caption>
        <thead>
          <tr>
            <th scope="col">Rep</th>
            {data.hours.map((hour) => (
              <th key={hour} scope="col">{HOUR_LABEL(hour)}:00</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.repId}>
              <th scope="row">{row.repName}</th>
              {data.hours.map((hour) => (
                <td key={hour}>{row.cells[hour] ?? 0}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[12px] text-stone" aria-live="polite">
        {selected
          ? `${selected.repName} · ${HOUR_LABEL(selected.hour)}:00–${HOUR_LABEL((selected.hour + 1) % 24)}:00 · ${selected.count} ${selected.count === 1 ? 'action' : 'actions'}`
          : 'Select a cell to see the exact count.'}
      </p>
    </V4Panel>
  )
}

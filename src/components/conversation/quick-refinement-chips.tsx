'use client'

import { cn } from 'cn'
import type { RefinementChip } from './conversation-workspace'

interface QuickRefinementChipsProps {
  chips: RefinementChip[]
  activeChip: string | null
  onChipClick: (chip: RefinementChip) => void
  disabled?: boolean
}

/**
 * QuickRefinementChips — contextual reply refinement options.
 *
 * Maximum 3–5 chips. No prompt-engineering UI.
 * Contextual chips appear only when relevant.
 */
export function QuickRefinementChips({ chips, activeChip, onChipClick, disabled }: QuickRefinementChipsProps) {
  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChipClick(chip)}
          disabled={disabled}
          className={cn(
            'rounded-full border px-2.5 py-1 text-[11px] transition-all duration-150',
            activeChip === chip.id
              ? 'border-orange/40 bg-orange/10 text-orange'
              : 'border-line bg-bone-raised/40 text-graphite hover:bg-bone-raised hover:text-ink',
            disabled && 'opacity-50 cursor-not-allowed',
          )}
        >
          {chip.label}
        </button>
      ))}
    </div>
  )
}

/**
 * TellRelayInput — optional natural instruction input.
 *
 * Secondary feature. User should normally need ZERO prompting.
 */
export function TellRelayInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Tell Relay...',
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-line bg-bone-raised/20 px-3 py-2 transition-colors focus-within:border-orange/30">
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && value.trim()) { e.preventDefault(); onSubmit() } }}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-stone"
      />
      {value.trim() && (
        <button
          type="button"
          onClick={onSubmit}
          className="text-[11px] text-orange hover:text-orange-light transition-colors"
        >
          Apply
        </button>
      )}
    </div>
  )
}

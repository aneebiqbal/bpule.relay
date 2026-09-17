'use client'

import { useState } from 'react'
import type { GenerationMode } from '@/lib/ai/generate'

interface GenerationModeSelectorProps {
  value: GenerationMode
  onChange: (mode: GenerationMode) => void
  /** Compact mode shows just a toggle; full mode shows labels + description. */
  compact?: boolean
  disabled?: boolean
}

/**
 * Standard / Premium generation mode selector.
 *
 * Standard (default): fast generation for everyday outreach.
 * Premium: stronger generation for important leads.
 */
export function GenerationModeSelector({
  value,
  onChange,
  compact = false,
  disabled = false,
}: GenerationModeSelectorProps) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => onChange(value === 'standard' ? 'premium' : 'standard')}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors ${
          value === 'premium'
            ? 'bg-orange/10 text-orange'
            : 'bg-bone-raised text-graphite hover:bg-bone-raised/80'
        }`}
        title={value === 'premium' ? 'Premium mode — click for Standard' : 'Standard mode — click for Premium'}
      >
        <span className={`size-1.5 rounded-full ${value === 'premium' ? 'bg-orange' : 'bg-stone'}`} />
        {value === 'premium' ? 'Premium' : 'Standard'}
      </button>
    )
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => onChange('standard')}
        disabled={disabled}
        className={`flex-1 rounded-lg px-3 py-2 text-left transition-colors ${
          value === 'standard'
            ? 'bg-ink text-bone'
            : 'bg-bone-raised text-graphite hover:bg-bone-raised/80'
        }`}
      >
        <div className="text-[13px] font-medium">Standard</div>
        <div className="text-[11px] opacity-70">Fast · recommended</div>
      </button>
      <button
        type="button"
        onClick={() => onChange('premium')}
        disabled={disabled}
        className={`flex-1 rounded-lg px-3 py-2 text-left transition-colors ${
          value === 'premium'
            ? 'bg-orange text-white'
            : 'bg-bone-raised text-graphite hover:bg-bone-raised/80'
        }`}
      >
        <div className="text-[13px] font-medium">Premium</div>
        <div className="text-[11px] opacity-70">Stronger · important leads</div>
      </button>
    </div>
  )
}

/**
 * Hook for managing generation mode state with localStorage persistence.
 */
export function useGenerationMode(defaultMode: GenerationMode = 'standard'): {
  mode: GenerationMode
  setMode: (mode: GenerationMode) => void
} {
  const [mode, setMode] = useState<GenerationMode>(defaultMode)

  return { mode, setMode }
}

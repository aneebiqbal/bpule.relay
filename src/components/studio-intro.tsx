'use client'

import { useSyncExternalStore } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { StudioMark } from '@/components/studio-brand'

const SESSION_KEY = 'studio-intro-seen'

const listeners = new Set<() => void>()

function readSeen(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getServerSnapshot(): boolean {
  return true
}

function markSeen() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1')
  } catch {
    // no-op
  }
  listeners.forEach((l) => l())
}

export function StudioIntro({ children }: { children: React.ReactNode }) {
  const seen = useSyncExternalStore(subscribe, readSeen, getServerSnapshot)

  if (seen) return <>{children}</>

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden bg-[#0e0c1a] px-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 30% 10%, color-mix(in srgb, var(--studio) 28%, transparent) 0%, transparent 55%), radial-gradient(ellipse at 80% 90%, color-mix(in srgb, var(--studio-light) 18%, transparent) 0%, transparent 45%)',
        }}
      />

      <div className="reveal-up relative z-10 flex max-w-md flex-col items-center text-center">
        <div className="gold-breathe mb-6 flex size-16 items-center justify-center rounded-2xl gradient-studio shadow-studio">
          <StudioMark className="size-9 bg-transparent" />
        </div>

        <p className="text-label text-studio-light">Part of Relay</p>
        <h1 className="text-display mt-3 text-4xl text-paper sm:text-5xl">Studio</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-paper/70">
          A quieter room for your writing. Answer a few real questions,
          get one real post, decide what stays.
        </p>

        <button
          onClick={markSeen}
          className="group mt-9 inline-flex items-center gap-2.5 rounded-2xl gradient-studio px-6 py-3 text-sm font-semibold text-paper shadow-studio transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
        >
          <Sparkles className="size-4" aria-hidden="true" />
          Continue
          <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

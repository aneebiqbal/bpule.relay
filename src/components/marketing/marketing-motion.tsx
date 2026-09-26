'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'

/**
 * Marketing motion primitives — one coherent motion language.
 *
 * MICRO: 120–220ms — hover, focus, buttons, chips
 * STANDARD: 250–450ms — cards entering, state changes
 * NARRATIVE: 500–900ms — hero/product storytelling
 */

export function useRevealer<T extends HTMLElement>(threshold = 0.15) {
  const ref = useRef<T>(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setRevealed(true); return }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { threshold, rootMargin: '0px 0px -8% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, revealed }
}

export function Revealer({
  children,
  delay = 0,
  className,
  as: Tag = 'div',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
  as?: 'div' | 'section' | 'article' | 'header' | 'footer'
}) {
  const { ref, revealed } = useRevealer<HTMLDivElement>()

  return (
    <Tag
      ref={ref}
      className={cn('marketing-revealer', revealed && 'marketing-revealer--visible', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  )
}

export function useCountUp(end: number, duration = 1200, enabled = true) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) { setValue(end); return }

    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(eased * end))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [end, duration, enabled])

  return value
}

export function SignalNode({
  active,
  delay = 0,
  children,
  className,
}: {
  active: boolean
  delay?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn('marketing-signal-node', active && 'marketing-signal-node--active', className)}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </span>
  )
}

export function AnimatedLine({ active, delay = 0 }: { active: boolean; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (active) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reduced) {
        el.style.setProperty('--line-progress', '1')
        return
      }
      setTimeout(() => el.style.setProperty('--line-progress', '1'), delay)
    }
  }, [active, delay])

  return <div ref={ref} className="marketing-line" style={{ '--line-progress': 0 } as React.CSSProperties} aria-hidden="true" />
}

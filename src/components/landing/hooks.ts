'use client'

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

export { useReducedMotion }

/**
 * Fires once when the element crosses the viewport threshold.
 * IntersectionObserver only — no scroll listeners.
 */
export function useInViewOnce<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.35,
  rootMargin = '0px 0px -10% 0px',
) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            observer.disconnect()
          }
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  return [ref, inView] as const
}

/**
 * True when the viewport is at least `width` px wide.
 * Deterministic after mount; SSR renders the desktop set.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener('change', update)
    return () => mql.removeEventListener('change', update)
  }, [query])

  return matches
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 767px)')
}

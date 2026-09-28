'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from 'cn'
import { motion } from 'motion/react'
import { STUDIO_IDEA, RELAY_CAPTURE, STUDIO_PIPELINE, RELAY_PIPELINE } from './data'
import { useInViewOnce, useReducedMotion, useIsMobile } from './hooks'

/**
 * StudioRelayHandoff — the visual climax.
 *
 * A Studio idea becomes published content, creates an attention signal,
 * and that signal travels one SVG path into Relay — transitioning from
 * cobalt to orange — where it resolves into a prospect, a conversation,
 * and the next action.
 *
 * Phases: 0 hidden → 1 studio in → 2 attention forms → 3 path draws
 *         → 4 signal travels → 5 relay captures.
 */

function hexLerp(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16))
  const p = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `#${p.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

const easeInOutCubic = (p: number) =>
  p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2

const PATH_DESKTOP = 'M 1,60 C 28,60 26,36 50,36 C 74,36 72,54 99,50'
const PATH_MOBILE = 'M 50,2 C 50,26 36,30 36,50 C 36,70 50,74 50,98'

export function StudioRelaySection() {
  const [ref, inView] = useInViewOnce<HTMLDivElement>(0.3)
  const reduced = useReducedMotion()
  const isMobile = useIsMobile()
  const [phase, setPhase] = useState(0)
  const startedRef = useRef(false)

  const desktopPathRef = useRef<SVGPathElement>(null)
  const mobilePathRef = useRef<SVGPathElement>(null)
  const dotRef = useRef<HTMLDivElement>(null)

  // Phase machine — fires once when the section enters view.
  useEffect(() => {
    if (!inView || startedRef.current) return
    startedRef.current = true
    if (reduced) {
      setPhase(5)
      return
    }
    const timers = [
      setTimeout(() => setPhase(1), 100),
      setTimeout(() => setPhase(2), 650),
      setTimeout(() => setPhase(3), 1300),
      setTimeout(() => setPhase(4), 2000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [inView, reduced])

  // Signal travels the path — cobalt → orange.
  useEffect(() => {
    if (phase !== 4) return
    const path = (isMobile ? mobilePathRef : desktopPathRef).current
    const dot = dotRef.current
    if (!path || !dot) {
      setPhase(5)
      return
    }
    const len = path.getTotalLength()
    const duration = 1400
    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / duration)
      const e = easeInOutCubic(p)
      const pt = path.getPointAtLength(e * len)
      dot.style.left = `${pt.x}%`
      dot.style.top = `${pt.y}%`
      dot.style.background = hexLerp('#3b5bdb', '#d4652f', e)
      if (p < 1) {
        raf = requestAnimationFrame(tick)
      } else {
        setPhase(5)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [phase, isMobile])

  const relayActive = phase >= 5

  return (
    <section id="studio" className="lg3-section lg3-section--handoff" data-section="studio-relay">
      <div className="lg3-section__inner lg3-section__inner--wide">
        <motion.header
          className="lg3-section__head"
          initial={false}
          animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="lg3-section__meta">
            <span className="lg3-section__index">06</span>
            Studio → Relay
          </p>
          <h2 className="lg3-section__title">
            Studio creates demand. <span className="lg3-title-accent">Relay captures it.</span>
          </h2>
          <p className="lg3-section__lede">
            One system, two halves. Content you publish becomes the signal
            Relay turns into your next conversation.
          </p>
        </motion.header>

        <div ref={ref} className="lg3-handoff" data-handoff="">
          {/* ── Studio side ── */}
          <motion.div
            className="lg3-handoff__side lg3-handoff__side--studio"
            initial={false}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            data-handoff-side="studio"
          >
            <p className="lg3-handoff__label lg3-handoff__label--cobalt">Studio · Ideas</p>

            <div className="lg3-idea">
              <p className="lg3-idea__title">{STUDIO_IDEA.title}</p>
              <p className="lg3-idea__angle">{STUDIO_IDEA.angle}</p>
              <div className="lg3-idea__row">
                <span className="lg3-idea__status">{STUDIO_IDEA.status}</span>
                <span className="lg3-idea__write">Write in Studio</span>
              </div>
            </div>

            <motion.div
              className="lg3-handoff__event"
              initial={false}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="lg3-handoff__eventdot lg3-handoff__eventdot--cobalt" aria-hidden="true" />
              {STUDIO_IDEA.published}
            </motion.div>

            <motion.div
              className={cn('lg3-handoff__event', 'lg3-handoff__event--attention', phase >= 2 && 'is-live')}
              initial={false}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.45, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
              data-attention=""
            >
              <span className="lg3-handoff__eventdot lg3-handoff__eventdot--cobalt" aria-hidden="true" />
              {STUDIO_IDEA.attention}
            </motion.div>

            <p className="lg3-pipeline lg3-pipeline--cobalt" aria-label="Studio pipeline">
              {STUDIO_PIPELINE.map((stage, i) => (
                <span key={stage} className="lg3-pipeline__item">
                  {i > 0 && <span className="lg3-pipeline__arrow" aria-hidden="true">→</span>}
                  {stage}
                </span>
              ))}
            </p>
          </motion.div>

          {/* ── The path ── */}
          <div className="lg3-handoff__pathwrap" aria-hidden="true" data-handoff-path="">
            <svg className="lg3-handoff__svg lg3-handoff__svg--desktop" viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <linearGradient id="lg3-hograd" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#3b5bdb" />
                  <stop offset="100%" stopColor="#d4652f" />
                </linearGradient>
              </defs>
              <path
                ref={desktopPathRef}
                d={PATH_DESKTOP}
                pathLength={1}
                className={cn('lg3-handoff__path', phase >= 3 && 'is-drawn')}
              />
            </svg>
            <svg className="lg3-handoff__svg lg3-handoff__svg--mobile" viewBox="0 0 100 100" preserveAspectRatio="none">
              <path
                ref={mobilePathRef}
                d={PATH_MOBILE}
                pathLength={1}
                className={cn('lg3-handoff__path', phase >= 3 && 'is-drawn')}
              />
            </svg>
            <div
              ref={dotRef}
              className={cn('lg3-handoff__dot', phase >= 4 && 'is-traveling', phase >= 5 && 'is-arrived')}
              data-handoff-dot=""
            />
          </div>

          {/* ── Relay side ── */}
          <motion.div
            className="lg3-handoff__side lg3-handoff__side--relay"
            initial={false}
            animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            data-handoff-side="relay"
          >
            <p className="lg3-handoff__label lg3-handoff__label--orange">Relay · Signals</p>

            <motion.div
              className="lg3-capture"
              initial={false}
              animate={relayActive ? 'show' : 'hidden'}
              variants={{ show: { transition: { staggerChildren: 0.2 } }, hidden: {} }}
              data-capture=""
            >
              {RELAY_CAPTURE.map((row, i) => (
                <motion.div
                  key={row.id}
                  className={cn('lg3-capture__row', i === RELAY_CAPTURE.length - 1 && 'lg3-capture__row--action')}
                  variants={{
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
                  }}
                  data-capture-row={row.id}
                >
                  <span className={cn('lg3-capture__kind', i === RELAY_CAPTURE.length - 1 && 'lg3-capture__kind--orange')}>
                    {row.kind}
                  </span>
                  <div className="min-w-0">
                    <p className="lg3-capture__text">{row.text}</p>
                    <p className="lg3-capture__sub">{row.sub}</p>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <p className="lg3-pipeline lg3-pipeline--orange" aria-label="Relay pipeline">
              {RELAY_PIPELINE.map((stage, i) => (
                <span key={stage} className="lg3-pipeline__item">
                  {i > 0 && <span className="lg3-pipeline__arrow" aria-hidden="true">→</span>}
                  {stage}
                </span>
              ))}
            </p>
          </motion.div>
        </div>

        <p className="lg3-handoff__caption" data-handoff-caption="">
          <span className="lg3-handoff__caption-cobalt">Studio creates demand</span>
          <span className="lg3-handoff__caption-arrow" aria-hidden="true">→</span>
          <span className="lg3-handoff__caption-orange">Relay captures it</span>
        </p>
      </div>
    </section>
  )
}

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { cn } from 'cn'
import { Menu, X } from 'lucide-react'

const NAV_ITEMS = [
  { href: '/#product', label: 'Product' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#studio', label: 'Studio' },
  { href: '/#team', label: 'Team' },
]

const STATE_BY_SECTION: Record<string, { label: string; tone: 'orange' | 'cobalt' }> = {
  hero: { label: 'RELAY / CAPTURE', tone: 'orange' },
  'how-it-works': { label: 'RELAY / CAPTURE', tone: 'orange' },
  problem: { label: 'RELAY / CAPTURE', tone: 'orange' },
  intelligence: { label: 'RELAY / CAPTURE', tone: 'orange' },
  priority: { label: 'RELAY / CAPTURE', tone: 'orange' },
  conversation: { label: 'RELAY / CAPTURE', tone: 'orange' },
  'lead-journey': { label: 'RELAY / CAPTURE', tone: 'orange' },
  'human-control': { label: 'RELAY / CAPTURE', tone: 'orange' },
  team: { label: 'RELAY / CAPTURE', tone: 'orange' },
  'relay-loop': { label: 'RELAY / CAPTURE', tone: 'orange' },
  'product-proof': { label: 'RELAY / CAPTURE', tone: 'orange' },
  studio: { label: 'STUDIO / CREATE', tone: 'cobalt' },
  'demand-loop': { label: 'STUDIO / CREATE', tone: 'cobalt' },
  'final-cta': { label: 'RELAY / CAPTURE', tone: 'orange' },
}

const OBSERVED_IDS = Object.keys(STATE_BY_SECTION)

export function MarketingNav() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('hero')
  const onHome = pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  useEffect(() => {
    if (!onHome) return
    const sections = OBSERVED_IDS
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el))
    if (!sections.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        const topMost = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (topMost?.target.id) setActiveSection(topMost.target.id)
      },
      { rootMargin: '-28% 0px -50% 0px', threshold: [0.1, 0.2, 0.35, 0.5] },
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [onHome])

  const system = useMemo(() => {
    if (!onHome) return { label: 'RELAY / CAPTURE', tone: 'orange' as const }
    return STATE_BY_SECTION[activeSection] ?? { label: 'RELAY / CAPTURE', tone: 'orange' as const }
  }, [activeSection, onHome])

  const signalColor = system.tone === 'orange' ? 'var(--orange-signal)' : 'var(--cobalt-signal)'

  return (
    <header
      className={cn(
        'marketing-nav',
        scrolled && 'marketing-nav--scrolled',
      )}
    >
      <div className="marketing-nav__inner">
        {/* Left: Logo */}
        <Link href="/" className="marketing-nav__logo" aria-label="Relay home">
          <span className="marketing-nav__mark" aria-hidden="true">
            <span className="marketing-nav__dot" style={{ background: signalColor }} />
          </span>
          <span className="marketing-nav__wordmark">RELAY</span>
        </Link>

        {/* Center: Nav links (desktop) */}
        <nav className="marketing-nav__links" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="marketing-nav__link"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Right: Status + CTA */}
        <div className="marketing-nav__right">
          <span
            className="marketing-nav__status"
            style={{ color: signalColor }}
            aria-live="polite"
          >
            {system.label}
          </span>
          <Link href="/login" className="marketing-nav__signin">
            Sign in
          </Link>
          <Link href="/signup" className="marketing-nav__cta">
            Start with Relay
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          className="marketing-nav__toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="marketing-nav__mobile">
          <nav aria-label="Mobile">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="marketing-nav__mobile-link"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <hr className="marketing-nav__mobile-divider" />
            <Link href="/login" className="marketing-nav__mobile-link" onClick={() => setMobileOpen(false)}>
              Sign in
            </Link>
            <Link href="/signup" className="marketing-nav__mobile-cta" onClick={() => setMobileOpen(false)}>
              Start with Relay
            </Link>
          </nav>
        </div>
      )}
    </header>
  )
}

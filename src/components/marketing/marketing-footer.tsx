import Link from 'next/link'

/**
 * Marketing footer — intentional, minimal.
 */
export function MarketingFooter() {
  const year = new Date().getFullYear()

  return (
    <footer className="marketing-footer">
      <div className="marketing-footer__inner">
        {/* Left: Brand + maker */}
        <div className="marketing-footer__brand">
          <span className="marketing-footer__wordmark">RELAY</span>
          <p className="marketing-footer__maker">
            Made in Pakistan, for the world.
          </p>
          <p className="marketing-footer__company">
            A product of Breakthrough Pulse Pvt. Limited.
          </p>
        </div>

        {/* Right: Legal */}
        <nav className="marketing-footer__legal" aria-label="Legal">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/acceptable-use">Acceptable Use</Link>
          <Link href="/security">Security</Link>
          <Link href="/trust">Trust</Link>
        </nav>
      </div>

      {/* Bottom bar */}
      <div className="marketing-footer__bottom">
        <div className="marketing-footer__bottom-inner">
          <span className="marketing-footer__copy">&copy; {year} Relay</span>
        </div>
      </div>
    </footer>
  )
}

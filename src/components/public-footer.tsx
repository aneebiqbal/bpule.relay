import Link from "next/link";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/security", label: "Security" },
  { href: "/trust", label: "Trust" },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-[var(--bone-200)] bg-[var(--bone-000)]">
      <div className="landing-shell-wide py-10 sm:py-12">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-mono-regular text-[10px] tracking-[0.16em] uppercase text-[var(--stone)]">
              Relay
            </p>
            <p className="mt-2 text-[14px] text-[var(--ink-800)]">Made in Pakistan, for the world.</p>
            <p className="mt-1 text-[13px] text-[var(--stone)]">A product of Breakthrough Pulse Pvt. Limited.</p>
          </div>

          <nav className="flex flex-wrap gap-x-4 gap-y-2 sm:justify-end" aria-label="Footer legal links">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[12px] text-[var(--ink-700)] transition-colors hover:text-[var(--ink-900)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <p className="mt-8 text-mono-regular text-[10px] tracking-[0.12em] uppercase text-[var(--stone)]">
          © {new Date().getFullYear()} Relay
        </p>
      </div>
    </footer>
  );
}

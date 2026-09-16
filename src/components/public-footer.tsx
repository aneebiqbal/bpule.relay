import Link from "next/link";
import { RelayBrand } from "@/components/brand";

const PRODUCT_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#studio", label: "Studio" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#teams", label: "For teams" },
  { href: "/pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

const COMPANY_LINKS = [
  { href: "/login", label: "Sign in" },
  { href: "/signup", label: "Start free" },
];

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/acceptable-use", label: "Acceptable Use" },
  { href: "/ai-policy", label: "AI Policy" },
  { href: "/security", label: "Security" },
];

const TRUST_LINKS = [
  { href: "/trust", label: "Trust Center" },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-bone">
      <div className="mx-auto max-w-6xl section-padding py-16">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand column */}
          <div className="space-y-4">
            <RelayBrand />
            <p className="max-w-xs text-[13px] leading-relaxed text-graphite">
              Relay tells you what deserves your attention — and helps you act on it.
            </p>
          </div>

          {/* Product */}
          <div>
            <h3 className="text-label text-stone">Product</h3>
            <ul className="mt-4 space-y-2.5">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-graphite transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-label text-stone">Get started</h3>
            <ul className="mt-4 space-y-2.5">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-graphite transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Trust */}
          <div>
            <h3 className="text-label text-stone">Trust</h3>
            <ul className="mt-4 space-y-2.5">
              {TRUST_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-graphite transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-label text-stone">Legal</h3>
            <ul className="mt-4 space-y-2.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-[13px] text-graphite transition-colors hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 sm:flex-row sm:items-center">
          <p className="text-mono-regular text-[11px] text-stone">
            &copy; {new Date().getFullYear()} Relay. All rights reserved.
          </p>
          <p className="text-mono-regular text-[11px] text-stone">
            Signal over noise.
          </p>
        </div>
      </div>
    </footer>
  );
}

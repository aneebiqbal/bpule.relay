"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cn } from "cn";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";

const NAV_ITEMS = [
  { href: "/#product", label: "Product" },
  { href: "/#studio", label: "Studio" },
  { href: "/#teams", label: "Teams" },
  { href: "/#how-it-works", label: "How it works" },
];

const STATE_BY_SECTION: Record<string, { label: string; tone: "orange" | "cobalt" }> = {
  hero: { label: "RELAY / CAPTURE", tone: "orange" },
  "how-it-works": { label: "RELAY / CAPTURE", tone: "orange" },
  product: { label: "RELAY / CAPTURE", tone: "orange" },
  "prospect-check": { label: "RELAY / CAPTURE", tone: "orange" },
  identities: { label: "RELAY / CAPTURE", tone: "orange" },
  proof: { label: "RELAY / CAPTURE", tone: "orange" },
  "human-gate": { label: "RELAY / CAPTURE", tone: "orange" },
  studio: { label: "STUDIO / CREATE", tone: "cobalt" },
  "studio-identity": { label: "STUDIO / CREATE", tone: "cobalt" },
  "studio-evolution": { label: "STUDIO / CREATE", tone: "cobalt" },
  "art-system": { label: "STUDIO / CREATE", tone: "cobalt" },
  convergence: { label: "STUDIO / CREATE", tone: "cobalt" },
  loop: { label: "STUDIO / CREATE", tone: "cobalt" },
  teams: { label: "RELAY / CAPTURE", tone: "orange" },
  manifesto: { label: "RELAY / CAPTURE", tone: "orange" },
  pakistan: { label: "RELAY / CAPTURE", tone: "orange" },
  "who-for": { label: "RELAY / CAPTURE", tone: "orange" },
  depth: { label: "RELAY / CAPTURE", tone: "orange" },
  pricing: { label: "RELAY / CAPTURE", tone: "orange" },
  "final-return": { label: "RELAY / CAPTURE", tone: "orange" },
  "final-cta": { label: "RELAY / CAPTURE", tone: "orange" },
};

const OBSERVED_IDS = Object.keys(STATE_BY_SECTION);

export function PublicNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("hero");
  const onHome = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  useEffect(() => {
    if (!onHome) return;

    const sections = OBSERVED_IDS
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const topMost = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!topMost?.target.id) return;
        setActiveSection(topMost.target.id);
      },
      {
        rootMargin: "-28% 0px -50% 0px",
        threshold: [0.1, 0.2, 0.35, 0.5],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onHome]);

  const system = useMemo(() => {
    if (!onHome) return { label: "RELAY / CAPTURE", tone: "orange" as const };
    return STATE_BY_SECTION[activeSection] ?? { label: "RELAY / CAPTURE", tone: "orange" as const };
  }, [activeSection, onHome]);

  const signalColor = system.tone === "orange" ? "var(--orange-signal)" : "var(--cobalt-signal)";

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="landing-shell-wide pt-3 sm:pt-4">
        <div
          className={cn(
            "transition-all duration-300",
            scrolled
              ? "rounded-[8px] border border-[var(--bone-200)] bg-[color-mix(in_srgb,var(--bone-000)_90%,transparent)] shadow-[0_20px_30px_-28px_rgba(17,13,10,0.65)] backdrop-blur"
              : "rounded-[4px] border border-transparent bg-transparent",
          )}
        >
          <div
            className={cn(
              "grid grid-cols-[auto_1fr_auto] items-center gap-3 px-3 transition-[height,padding] duration-300 sm:px-4",
              scrolled ? "h-12" : "h-14 sm:h-16",
            )}
          >
            <Link href="/" className="inline-flex items-center gap-2" aria-label="Relay home">
              <span className="h-2 w-2 rounded-full" style={{ background: signalColor }} aria-hidden="true" />
              <span className="text-[13px] font-semibold tracking-[0.18em] text-[var(--ink-900)]">RELAY</span>
            </Link>

            <nav className="hidden items-center justify-center gap-6 md:flex" aria-label="Primary">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-[13px] font-medium text-[var(--ink-700)] transition-colors hover:text-[var(--ink-900)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="hidden items-center gap-4 md:flex">
              <p className="inline-flex items-center gap-2 whitespace-nowrap text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--stone)]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: signalColor }} aria-hidden="true" />
                {system.label}
              </p>
              <Link
                href="/login"
                className="text-[13px] font-medium text-[var(--ink-700)] transition-colors hover:text-[var(--ink-900)]"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => track(AnalyticsEvents.START_FREE_CLICKED, { location: "nav" })}
                className="group inline-flex h-8 items-center gap-1 rounded-[4px] bg-[var(--ink-950)] px-3 text-[12px] font-medium text-[var(--bone-000)]"
              >
                START FREE
                <span className="transition-transform duration-300 group-hover:translate-x-[2px]">-&gt;</span>
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen((value) => !value)}
              className="ml-auto flex h-9 w-9 items-center justify-center text-[var(--ink-900)] md:hidden"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </div>

          {mobileOpen && (
            <div className="border-t border-[var(--bone-200)] bg-[var(--bone-000)] px-4 py-4 md:hidden">
              <p className="mb-3 inline-flex items-center gap-2 text-mono-regular text-[10px] tracking-[0.14em] uppercase text-[var(--stone)]">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: signalColor }} aria-hidden="true" />
                {system.label}
              </p>

              <nav aria-label="Mobile">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="block py-2.5 text-[14px] font-medium text-[var(--ink-900)]"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-3 grid gap-2 border-t border-[var(--bone-200)] pt-3">
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  className="inline-flex h-10 items-center justify-center rounded-[4px] border border-[var(--bone-200)] text-[13px] font-medium text-[var(--ink-900)]"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  onClick={() => {
                    setMobileOpen(false);
                    track(AnalyticsEvents.START_FREE_CLICKED, { location: "nav_mobile" });
                  }}
                  className="inline-flex h-10 items-center justify-center rounded-[4px] bg-[var(--ink-950)] text-[13px] font-medium text-[var(--bone-000)]"
                >
                  START FREE -&gt;
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

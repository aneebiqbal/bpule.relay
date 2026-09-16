"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { RelayBrand } from "@/components/brand";
import { cn } from "cn";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";
import { useActiveChapter } from "@/lib/landing-motion";
import { LANDING_CHAPTERS } from "@/components/landing/chapter-rail";

const NAV_ITEMS = [
  { href: "/#product", label: "Product", n: "01" },
  { href: "/#studio", label: "Studio", n: "02" },
  { href: "/#how-it-works", label: "How it works", n: "03" },
  { href: "/#teams", label: "For teams", n: "04" },
];

export function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const chapter = useActiveChapter(LANDING_CHAPTERS.map((c) => c.id));
  const studioLive = chapter === "chapter-create" || chapter === "chapter-capture" || chapter === "chapter-learn";

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

  const accent = studioLive ? "var(--cobalt-signal)" : "var(--orange-signal)";

  return (
    <header
      className={cn("fixed inset-x-0 top-0 z-50 transition-colors duration-300", scrolled ? "bg-[var(--bone-000)]" : "bg-transparent")}
      style={{ borderBottom: `1px solid ${scrolled ? "var(--bone-200)" : "transparent"}` }}
    >
      <div
        className={cn(
          "landing-shell flex items-center justify-between transition-[height] duration-300",
          scrolled ? "h-12" : "h-16",
        )}
      >
        <Link href="/" aria-label="Relay home" className="inline-flex items-center gap-2.5">
          <RelayBrand />
          <span
            className="flex items-center gap-2 overflow-hidden transition-[max-width,opacity] duration-500"
            style={{ maxWidth: studioLive ? 80 : 0, opacity: studioLive ? 1 : 0 }}
          >
            <span className="h-3 w-px" style={{ background: "var(--cobalt-signal)" }} aria-hidden="true" />
            <span
              className="text-mono-regular whitespace-nowrap text-[10px] tracking-[0.14em] uppercase"
              style={{ color: "var(--cobalt-signal)" }}
            >
              Studio
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group inline-flex items-baseline gap-1.5 text-[13px] font-medium text-graphite transition-colors hover:text-ink"
            >
              <span className="text-mono-regular text-[10px] text-stone-light transition-colors group-hover:text-orange">
                {item.n}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 md:flex">
          <Link href="/login" className="text-[13px] font-medium text-graphite transition-colors hover:text-ink">
            Sign in
          </Link>
          <Link
            href="/signup"
            onClick={() => track(AnalyticsEvents.START_FREE_CLICKED, { location: "nav" })}
            className="group relative inline-flex h-8 items-center gap-2 overflow-hidden pl-4 pr-3.5 text-[13px] font-medium text-bone transition-transform active:scale-[0.97]"
            style={{ background: "var(--ink-950)", borderRadius: 2 }}
          >
            <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: accent }} aria-hidden="true" />
            <span className="relative">Start free</span>
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex size-9 items-center justify-center text-ink md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden" style={{ borderTop: "1px solid var(--bone-200)", background: "var(--bone-000)" }}>
          <nav className="mx-auto max-w-6xl px-6 py-4" aria-label="Mobile">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex items-baseline gap-3 py-2.5 text-[14px] font-medium text-ink"
              >
                <span className="text-mono-regular text-[10px] text-stone">{item.n}</span>
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 pt-4" style={{ borderTop: "1px solid var(--bone-200)" }}>
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 items-center justify-center border px-4 text-[14px] font-medium text-ink"
                style={{ borderColor: "var(--bone-200)", borderRadius: 2 }}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="relative inline-flex h-10 items-center justify-center overflow-hidden pl-4 text-[14px] font-medium text-bone"
                style={{ background: "var(--ink-950)", borderRadius: 2 }}
              >
                <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: "var(--orange-signal)" }} aria-hidden="true" />
                <span className="relative">Start free</span>
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

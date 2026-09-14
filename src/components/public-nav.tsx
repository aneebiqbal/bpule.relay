"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { RelayBrand } from "@/components/brand";
import { cn } from "cn";
import { AnalyticsEvents } from "@/lib/analytics/events";
import { track } from "@/lib/analytics/track";

const NAV_ITEMS = [
  { href: "/#product", label: "Product" },
  { href: "/#studio", label: "Studio" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];

export function PublicNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-200",
        scrolled
          ? "border-b border-line bg-bone/90 backdrop-blur-md"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between section-padding">
        <Link href="/" aria-label="Relay home">
          <RelayBrand />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-7 md:flex" aria-label="Primary">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] font-medium text-graphite transition-colors hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            href="/login"
            className="text-[13px] font-medium text-graphite transition-colors hover:text-ink"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            onClick={() => track(AnalyticsEvents.START_FREE_CLICKED, { location: "nav" })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-orange px-3.5 text-[13px] font-medium text-bone transition-all hover:bg-orange-dark active:scale-[0.97]"
          >
            Start free
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex size-9 items-center justify-center rounded-lg text-ink transition-colors hover:bg-bone-raised md:hidden"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-line bg-bone md:hidden">
          <nav className="mx-auto max-w-6xl space-y-1 px-6 py-4" aria-label="Mobile">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-[14px] font-medium text-ink transition-colors hover:bg-bone-raised"
              >
                {item.label}
              </Link>
            ))}
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-[14px] font-medium text-ink transition-colors hover:bg-bone-raised"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-orange px-4 text-[14px] font-medium text-bone transition-all hover:bg-orange-dark"
              >
                Start free
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

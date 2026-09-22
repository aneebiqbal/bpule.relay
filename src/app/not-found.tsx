import type { Metadata } from "next";
import Link from "next/link";
import { RelayBrand } from "@/components/brand";
import { ArrowLeft, Home } from "lucide-react";

export const metadata: Metadata = {
  title: "Page not found | Relay",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center gradient-mesh">
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 size-64 rounded-full bg-orange/[0.08] blur-[80px]" />
      <div className="relative">
        <RelayBrand />
        <div className="mt-8 max-w-sm space-y-3">
          <h1 className="text-heading text-2xl text-ink">That page is not here</h1>
          <p className="text-sm leading-relaxed text-graphite">
            The page may have moved, or the address is wrong. Head back to
            Relay and keep going.
          </p>
        </div>
        <div className="mt-6 flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-solid px-5 py-2.5 text-sm font-medium text-on-solid transition-all hover:bg-solid/90 active:scale-[0.97]"
          >
            <Home className="size-4" />
            Home
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-5 py-2.5 text-sm font-medium text-ink transition-all hover:bg-bone-raised"
          >
            <ArrowLeft className="size-4" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link"
import { RelayBrand } from "@/components/brand"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <RelayBrand />
      <div className="space-y-2">
        <h1 className="text-xl font-medium tracking-tight text-ink">
          That page is not here
        </h1>
        <p className="max-w-sm text-sm leading-relaxed text-slate">
          The lead may have been removed, or the address is wrong. Head back to
          your queue and keep going.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-lg bg-gold px-4 py-2 text-sm font-medium text-paper transition-colors hover:bg-gold/90"
      >
        Back to Today
      </Link>
    </div>
  )
}

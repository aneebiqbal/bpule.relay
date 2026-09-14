import Link from "next/link"
import { RelayBrand } from "@/components/brand"
import { ArrowLeft } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center gradient-mesh">
      <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 size-64 rounded-full bg-orange/[0.08] blur-[80px]" />
      <div className="relative">
        <RelayBrand />
        <div className="mt-8 max-w-sm space-y-3">
          <h1 className="text-heading text-2xl text-ink">That page is not here</h1>
          <p className="text-sm leading-relaxed text-slate">
            The lead may have been removed, or the address is wrong. Head back to
            your queue and keep going.
          </p>
        </div>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-ink px-6 py-3 text-sm font-medium text-bone transition-all duration-300 hover:bg-ink/90 hover:shadow-lg active:scale-[0.97]"
        >
          <ArrowLeft className="size-4" />
          Back to Today
        </Link>
      </div>
    </div>
  )
}

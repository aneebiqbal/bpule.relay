import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/current'
import { OnboardingWizard } from '@/components/onboarding-wizard'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function NewPersonaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="space-y-5">
      <header className="srf-sheet mark-corners relative px-5 py-6 sm:px-7">
        <p className="text-mono-medium text-[10px] uppercase tracking-[0.14em] text-cobalt">Studio / New Identity</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-ink">Create Content Identity</h1>
          <Link href="/content" className="rounded border border-line px-3 py-1.5 text-sm text-graphite hover:bg-bone-raised hover:text-ink">
            Cancel
          </Link>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-graphite">
          Build your writing identity from real experience. Studio uses this to choose angles and maintain voice.
        </p>
      </header>
      <OnboardingWizard />
    </div>
  )
}

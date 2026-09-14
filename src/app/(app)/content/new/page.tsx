import Link from 'next/link'
import { getCurrentUser } from '@/lib/auth/current'
import { OnboardingWizard } from '@/components/onboarding-wizard'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function NewPersonaPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-bone">
      <header className="border-b border-ink/10 px-4 py-4">
        <div className="mx-auto max-w-xl flex items-center justify-between">
          <h1 className="text-lg font-semibold text-ink">Create Content Identity</h1>
          <Link href="/content" className="text-sm text-graphite hover:text-ink">
            Cancel
          </Link>
        </div>
      </header>
      <OnboardingWizard />
    </div>
  )
}

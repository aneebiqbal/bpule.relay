import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getCurrentUser } from '@/lib/auth/current'
import { isDemoMode } from '@/lib/ai/config'
import { createScoutStore } from '@/lib/store'
import { AppRail } from '@/components/app-rail'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')
  if (!user.profile) redirect('/onboarding')

  const store = await createScoutStore()
  const queue = await store.getQueue()

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      <AppRail
        repName={user.rep.name}
        role={user.rep.role}
        calibrated={Boolean(user.profile)}
        demo={isDemoMode()}
        todaySends={queue.todaySends}
        dailyLimit={queue.dailyLimit}
      />
      <main className="mx-auto w-full max-w-6xl px-5 py-7 lg:px-10">
        {children}
      </main>
    </div>
  )
}
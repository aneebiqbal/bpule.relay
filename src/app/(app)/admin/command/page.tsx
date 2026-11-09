import { TeamToday } from '@/components/team/team-today'

export const dynamic = 'force-dynamic'

/**
 * Admin → Command Center. The same operating page as Team → Today, reached
 * from the Admin domain — one implementation, two role entry points.
 */
export default function CommandPage() {
  return <TeamToday />
}

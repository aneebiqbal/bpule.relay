import { redirect } from 'next/navigation'

/** Compatibility: Growth moved to Content → /content/growth. */
export default function LegacyGrowthPage() {
  redirect('/content/growth')
}

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/** Compatibility: post detail moved into Studio → /content. */
export default function StudioPostDetailRedirect() {
  redirect('/content')
}

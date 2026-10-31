import { redirect } from 'next/navigation'

/** Canonical Home alias — `/dashboard` remains the implementation during Sprint 1. */
export default function HomePage() {
  redirect('/dashboard')
}

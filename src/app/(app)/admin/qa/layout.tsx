import { requireProductAdmin } from '@/lib/auth/admin-page'

export default async function AdminQaLayout({ children }: { children: React.ReactNode }) {
  await requireProductAdmin()
  return children
}

import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getCurrentUser } from '@/lib/auth/current'
import { safeErrorResponse } from '@/lib/errors'

export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })

  try {
    const store = await createScoutStore()
    const reps = await store.listAllReps()
    return NextResponse.json({
      reps: reps.map((r) => ({ id: r.id, name: r.name, role: r.role })),
    })
  } catch (error) {
    return safeErrorResponse(error, 500, 'Failed to load team members.', 'reps')
  }
}

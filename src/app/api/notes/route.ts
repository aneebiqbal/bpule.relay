import { NextResponse } from 'next/server'
import { getDatabaseCapabilities, notAvailableBody } from '@/lib/operations/capabilities'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { resolveOperationalScope } from '@/lib/operations/scope'
import {
  NoteError,
  assertNoteSubjectAccess,
  createNote,
  isNoteSubjectType,
  listNotes,
  normalizeNoteBody,
} from '@/lib/operations/notes'

export const dynamic = 'force-dynamic'

function fail(err: unknown) {
  if (err instanceof NoteError) return NextResponse.json({ error: err.message }, { status: err.status })
  console.error('notes route failed:', err)
  return NextResponse.json({ error: 'Notes failed.' }, { status: 500 })
}

export async function GET(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const subjectType = url.searchParams.get('subjectType')
  const subjectId = url.searchParams.get('subjectId') ?? ''
  if (!isNoteSubjectType(subjectType)) return NextResponse.json({ error: 'subjectType required' }, { status: 400 })

  try {
    const client = (await createScoutStore()).getSupabaseClient()
    if (!(await getDatabaseCapabilities(client)).internalNotes) {
      return NextResponse.json({ notes: [], available: false })
    }
    const scope = await resolveOperationalScope(client, auth)
    await assertNoteSubjectAccess(client, auth, scope, subjectType, subjectId)
    const notes = await listNotes(client, auth, subjectType, subjectId)
    return NextResponse.json({ notes: notes ?? [], available: notes !== null })
  } catch (err) {
    return fail(err)
  }
}

export async function POST(request: Request) {
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as {
    subjectType?: unknown
    subjectId?: unknown
    body?: unknown
  }
  if (!isNoteSubjectType(body.subjectType) || typeof body.subjectId !== 'string') {
    return NextResponse.json({ error: 'subjectType and subjectId required' }, { status: 400 })
  }

  try {
    const text = normalizeNoteBody(body.body)
    const client = (await createScoutStore()).getSupabaseClient()
    if (!(await getDatabaseCapabilities(client)).internalNotes) {
      return NextResponse.json(notAvailableBody('internalNotes'), { status: 503 })
    }
    const scope = await resolveOperationalScope(client, auth)
    await assertNoteSubjectAccess(client, auth, scope, body.subjectType, body.subjectId)
    const note = await createNote(client, auth, {
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      body: text,
    })
    return NextResponse.json({ note }, { status: 201 })
  } catch (err) {
    return fail(err)
  }
}

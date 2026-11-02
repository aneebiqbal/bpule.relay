import { NextResponse } from 'next/server'
import { getDatabaseCapabilities, notAvailableBody } from '@/lib/operations/capabilities'
import { getAuthContext } from '@/lib/auth/organization'
import { createScoutStore } from '@/lib/store'
import { resolveOperationalScope } from '@/lib/operations/scope'
import {
  NoteError,
  assertNoteSubjectAccess,
  deleteNote,
  editNote,
  loadNoteSubject,
  normalizeNoteBody,
} from '@/lib/operations/notes'

export const dynamic = 'force-dynamic'

function fail(err: unknown) {
  if (err instanceof NoteError) return NextResponse.json({ error: err.message }, { status: err.status })
  console.error('note route failed:', err)
  return NextResponse.json({ error: 'Note update failed.' }, { status: 500 })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await request.json().catch(() => ({}))) as { body?: unknown }

  try {
    const text = normalizeNoteBody(body.body)
    const client = (await createScoutStore()).getSupabaseClient()
    if (!(await getDatabaseCapabilities(client)).internalNotes) {
      return NextResponse.json(notAvailableBody('internalNotes'), { status: 503 })
    }
    // The author may have lost access to the subject since writing the note.
    const scope = await resolveOperationalScope(client, auth)
    const subject = await loadNoteSubject(client, auth, id)
    await assertNoteSubjectAccess(client, auth, scope, subject.subjectType, subject.subjectId)
    const { note } = await editNote(client, auth, id, text)
    return NextResponse.json({ note })
  } catch (err) {
    return fail(err)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await getAuthContext()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const client = (await createScoutStore()).getSupabaseClient()
    if (!(await getDatabaseCapabilities(client)).internalNotes) {
      return NextResponse.json(notAvailableBody('internalNotes'), { status: 503 })
    }
    await deleteNote(client, auth, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return fail(err)
  }
}

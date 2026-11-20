import { NextResponse } from 'next/server'
import { createScoutStore } from '@/lib/store'
import { getAuthContext } from '@/lib/auth/organization'
import { listDocuments } from '@/lib/job-discovery/service'
import type { ResumePaper } from '@/lib/job-discovery/types'

export const dynamic = 'force-dynamic'

function fileName(kind: string, format: string, title: string) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'job'
  return `${kind}-${slug}.${format}`
}

type Layout = 'modern' | 'technical' | 'minimal'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id, kind } = await params
  const url = new URL(request.url)
  const profileId = url.searchParams.get('profileId')
  const format = (url.searchParams.get('format') ?? 'pdf').toLowerCase()
  const layoutParam = url.searchParams.get('layout')
  if (!profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  if (!['pdf', 'docx', 'txt', 'zip'].includes(format)) {
    return NextResponse.json({ error: 'Format must be pdf, docx, txt or zip.' }, { status: 400 })
  }
  const paper: ResumePaper = url.searchParams.get('paper') === 'a4' ? 'a4' : 'letter'

  const db = store.getSupabaseClient()
  const doc = await db.from('application_documents').select('*')
    .eq('organization_id', auth.orgId).eq('job_id', id).eq('profile_id', profileId).eq('kind', kind)
    .order('version', { ascending: false }).limit(1)
  if (doc.error) return NextResponse.json({ error: 'Could not load the document.' }, { status: 500 })
  const row = (doc.data as Array<Record<string, unknown>> | null)?.[0]
  if (!row) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
  const job = await db.from('jobs').select('title').eq('id', id).maybeSingle()
  const title = String(job.data?.title ?? 'job')

  const text = String(row.text ?? '')
  const storedLayout = (row.content as Record<string, unknown> | null)?.layout
  const layout: Layout = layoutParam === 'technical' || layoutParam === 'minimal' || layoutParam === 'modern'
    ? layoutParam
    : storedLayout === 'technical' || storedLayout === 'minimal' || storedLayout === 'modern'
      ? storedLayout
      : 'modern'

  if (format === 'zip') {
    const all = await db.from('application_documents').select('*')
      .eq('organization_id', auth.orgId).eq('job_id', id).eq('profile_id', profileId)
      .order('version', { ascending: false }).limit(100)
    const docs = (all.data as Array<Record<string, unknown>> | null) ?? []
    const cvDoc = docs.find((doc) => doc.kind === 'cv')
    const coverDoc = docs.find((doc) => doc.kind === 'cover_letter')
    const [{ renderResumePdf }, { renderResumeDocx, zipFiles }] = await Promise.all([
      import('@/lib/job-discovery/pdf'),
      import('@/lib/job-discovery/docx'),
    ])
    const cvText = String(cvDoc?.text ?? '')
    const checklist = (cvDoc?.content as Record<string, unknown> | null)?.checklist as string[] | undefined ?? [
      'Verify the job is still open',
      'Confirm Pakistan eligibility',
      'Review the CV for truthful claims',
      'Download the application package',
      'Open the official application',
      'Confirm submission and record the outcome',
    ]
    const files = [
      { name: 'cv.pdf', data: renderResumePdf(cvText, layout, paper) },
      { name: 'cv.docx', data: renderResumeDocx(cvText, layout, paper) },
      { name: 'cover-letter.txt', data: Buffer.from(String(coverDoc?.text ?? ''), 'utf8') },
      { name: 'checklist.txt', data: Buffer.from(checklist.map((item, index) => `${index + 1}. ${item}`).join('\n'), 'utf8') },
      { name: 'linkedin-note.txt', data: Buffer.from(String(docs.find((doc) => doc.kind === 'linkedin_note')?.text ?? ''), 'utf8') },
    ]
    const buffer = zipFiles(files)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${fileName('application-package', 'zip', title)}"`,
      },
    })
  }
  if (format === 'txt') {
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName(kind, 'txt', title)}"`,
      },
    })
  }
  if (format === 'docx') {
    const { renderResumeDocx } = await import('@/lib/job-discovery/docx')
    const buffer = renderResumeDocx(text, layout, paper)
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName(kind, 'docx', title)}"`,
      },
    })
  }
  const { renderResumePdf } = await import('@/lib/job-discovery/pdf')
  const buffer = renderResumePdf(text, layout, paper)
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName(kind, 'pdf', title)}"`,
    },
  })
}

/** Save an edited document as a NEW version; never overwrite history. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; kind: string }> },
) {
  const store = await createScoutStore().catch(() => null)
  if (!store) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const auth = await getAuthContext().catch(() => null)
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  const { id, kind } = await params
  const body = (await request.json().catch(() => ({}))) as { profileId?: string; text?: string }
  if (!body.profileId) return NextResponse.json({ error: 'profileId is required.' }, { status: 400 })
  const text = typeof body.text === 'string' ? body.text : ''
  if (!text.trim()) return NextResponse.json({ error: 'Document text cannot be empty.' }, { status: 400 })

  const db = store.getSupabaseClient()
  const latest = await db.from('application_documents').select('*')
    .eq('organization_id', auth.orgId).eq('job_id', id).eq('profile_id', body.profileId).eq('kind', kind)
    .order('version', { ascending: false }).limit(1)
  const row = (latest.data as Array<Record<string, unknown>> | null)?.[0]
  if (!row) return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
  const nextVersion = (Number(row.version) || 0) + 1
  const content = (row.content as Record<string, unknown>) ?? {}
  const inserted = await db.from('application_documents').insert({
    organization_id: auth.orgId,
    job_id: id,
    profile_id: body.profileId,
    kind,
    version: nextVersion,
    content: { ...content, text },
    text,
    storage_path: null,
    ats: null,
  })
  if (inserted.error) return NextResponse.json({ error: 'Could not save the edit.' }, { status: 500 })
  const documents = await listDocuments(db, auth.orgId, body.profileId, id)
  return NextResponse.json({ documents, version: nextVersion })
}

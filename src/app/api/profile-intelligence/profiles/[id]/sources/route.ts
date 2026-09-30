import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth/organization'
import { can } from '@/lib/auth/organization'
import { safeErrorResponse } from '@/lib/errors'
import { createServiceSupabase } from '@/lib/supabase/service'
import { parseDocument, contentHash, sanitizeFilename } from '@/lib/profile-intelligence/parse-document'
import { runExtractionPipeline } from '@/lib/profile-intelligence/pipeline'
import { mergeSkillLists } from '@/lib/profile-intelligence/skill-normalization'

const MAX_BYTES = 20 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
  'text/markdown',
  'text/csv',
])

export const maxDuration = 120

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: profileId } = await params
  const authCtx = await getAuthContext()
  if (!authCtx) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (!can(authCtx, 'MANAGE_REVENUE_IDENTITIES')) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  }

  let files: File[]
  try {
    const form = await request.formData()
    files = form.getAll('files').filter((f): f is File => f instanceof File)
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files uploaded.' }, { status: 400 })
  }

  const client = createServiceSupabase()
  const orgId = authCtx.orgId

  const { data: profile } = await client
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .eq('organization_id', orgId)
    .single()

  if (!profile) {
    return NextResponse.json({ error: 'Profile not found.' }, { status: 404 })
  }

  const results: Array<{ filename: string; status: string; people_detected?: number; error?: string }> = []

  for (const file of files) {
    if (file.size > MAX_BYTES || !ALLOWED_MIME.has(file.type)) {
      results.push({ filename: file.name, status: 'skipped', error: 'Unsupported or too large.' })
      continue
    }

    try {
      const buffer = await file.arrayBuffer()
      const hash = contentHash(new TextDecoder().decode(buffer))
      const safeName = sanitizeFilename(file.name)
      const storagePath = `${orgId}/${profileId}/${crypto.randomUUID()}_${safeName}`

      await client.storage
        .from('profile-sources')
        .upload(storagePath, new Uint8Array(buffer), { contentType: file.type, upsert: false })

      await client.from('profile_sources').insert({
        organization_id: orgId,
        profile_id: profileId,
        storage_path: storagePath,
        original_filename: file.name.slice(0, 200),
        mime_type: file.type,
        file_size_bytes: file.size,
        file_hash: hash,
        parsing_status: 'pending',
        uploaded_by: authCtx.repId,
      })

      const parsed = await parseDocument(buffer, file.type, file.name)
      await client.from('profile_sources').update({
        parsing_status: 'parsed',
        parsed_content: parsed.content.slice(0, 50000),
        page_count: parsed.pageCount,
        parsed_at: new Date().toISOString(),
      }).eq('file_hash', hash)

      const extraction = await runExtractionPipeline(parsed, parsed.content, orgId)
      const personName = profile.full_name ?? profile.display_name ?? profile.label

      for (const [name, facts] of extraction.factsByPerson.entries()) {
        if (name.toLowerCase() === personName?.toLowerCase() || extraction.factsByPerson.size === 1) {
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (facts.primarySkills?.length) updates.primary_skills = mergeSkillLists(profile.primary_skills ?? [], facts.primarySkills)
          if (facts.technologies?.length) updates.technologies = mergeSkillLists(profile.technologies ?? [], facts.technologies)
          if (facts.industries?.length) updates.industries = mergeSkillLists(profile.industries ?? [], facts.industries)
          if (facts.specialties?.length) updates.specialties = mergeSkillLists(profile.specialties ?? [], facts.specialties)
          if (facts.currentRole && !profile.current_role) updates.current_role = facts.currentRole
          if (facts.professionalSummary && !profile.professional_summary) updates.professional_summary = facts.professionalSummary
          updates.source_count = (profile.source_count ?? 0) + 1

          await client.from('profiles').update(updates).eq('id', profileId)
        }
      }

      results.push({ filename: file.name, status: 'processed', people_detected: extraction.people.length })
    } catch (err) {
      results.push({ filename: file.name, status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return NextResponse.json({ results })
}

import type { DbClient } from '@/lib/db/types'
/**
 * Saved views (Phase 8.31). A named query string for one surface, private to
 * its owner. Restoring a view is navigation to `path?query` — the page's own
 * server scope still decides what the viewer may see, so a saved view can
 * never widen access.
 */
import type { AuthContext } from '@/lib/auth/organization'
import { isMissingRelation } from '@/lib/operations/db-errors'

export const SAVED_VIEW_SURFACES = {
  'team.people': '/team/people',
  'team.tasks': '/tasks?scope=team',
  'team.activity': '/team/activity',
  'team.performance': '/team/performance',
  accounts: '/accounts',
  leads: '/leads',
  chats: '/chats',
  'reports.sales': '/reports/sales',
  'reports.pipeline': '/reports/pipeline',
  'reports.team': '/team/performance',
  'reports.revenue': '/reports/revenue',
} as const

export type SavedViewSurface = keyof typeof SAVED_VIEW_SURFACES

export interface SavedView {
  id: string
  surface: SavedViewSurface
  name: string
  query: string
  href: string
  createdAt: string
}

export class SavedViewError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function isSavedViewSurface(value: unknown): value is SavedViewSurface {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SAVED_VIEW_SURFACES, value)
}

/** Keep only plain filter params; drop paging and anything oversized. */
export function sanitizeViewQuery(raw: unknown): string {
  const input = typeof raw === 'string' ? raw.replace(/^\?/, '') : ''
  const params = new URLSearchParams(input)
  const out = new URLSearchParams()
  for (const [key, value] of params) {
    // Paging and the open record (task drawer, selected conversation) are not filters.
    if (key === 'page' || key === 'task' || key === 'lead') continue
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,31}$/.test(key)) continue
    if (value.length > 200) continue
    out.set(key, value)
  }
  const s = out.toString()
  if (s.length > 2000) throw new SavedViewError('View filters are too long.', 400)
  return s
}

export function normalizeViewName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
  if (!name) throw new SavedViewError('Name the view.', 400)
  if (name.length > 80) throw new SavedViewError('View names are limited to 80 characters.', 400)
  return name
}

export function savedViewHref(surface: SavedViewSurface, query: string): string {
  const path = SAVED_VIEW_SURFACES[surface]
  return query ? `${path}?${query}` : path
}

interface Row {
  id: string
  surface: SavedViewSurface
  name: string
  query: string
  created_at: string
}

function toView(r: Row): SavedView {
  return { id: r.id, surface: r.surface, name: r.name, query: r.query, href: savedViewHref(r.surface, r.query), createdAt: r.created_at }
}

/** null when the table is not migrated yet. */
export async function listSavedViews(
  client: DbClient,
  auth: AuthContext,
  surface: SavedViewSurface,
): Promise<SavedView[] | null> {
  const { data, error } = await client
    .from('saved_views')
    .select('id, surface, name, query, created_at')
    .eq('organization_id', auth.orgId)
    .eq('owner_rep_id', auth.repId)
    .eq('surface', surface)
    .order('name', { ascending: true })
    .limit(50)
  if (error) {
    if (isMissingRelation(error)) return null
    throw error
  }
  return ((data ?? []) as Row[]).map(toView)
}

export async function createSavedView(
  client: DbClient,
  auth: AuthContext,
  input: { surface: SavedViewSurface; name: string; query: string },
): Promise<SavedView> {
  const scope = auth.isAdmin || auth.isOwner ? 'org' : auth.isManager ? 'team' : 'own'
  const { data, error } = await client
    .from('saved_views')
    .upsert(
      {
        organization_id: auth.orgId,
        owner_rep_id: auth.repId,
        surface: input.surface,
        name: input.name,
        query: input.query,
        scope,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_rep_id,surface,name' },
    )
    .select('id, surface, name, query, created_at')
    .single()
  if (error || !data) {
    if (isMissingRelation(error)) throw new SavedViewError('Saved views are not available yet.', 503)
    throw new SavedViewError(error?.message ?? 'Could not save view.', 500)
  }
  return toView(data as Row)
}

export async function deleteSavedView(client: DbClient, auth: AuthContext, id: string): Promise<void> {
  const { error, count } = await client
    .from('saved_views')
    .delete({ count: 'exact' })
    .eq('organization_id', auth.orgId)
    .eq('owner_rep_id', auth.repId)
    .eq('id', id)
  if (error) {
    if (isMissingRelation(error)) throw new SavedViewError('Saved views are not available yet.', 503)
    throw new SavedViewError(error.message, 500)
  }
  if (!count) throw new SavedViewError('View not found.', 404)
}

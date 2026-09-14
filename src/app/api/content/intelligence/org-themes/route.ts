import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth/current'
import { createScoutStore } from '@/lib/store'
import { detectOrgThemes, areIdeasTooSimilar } from '@/lib/content/intelligence/org-intelligence'

export const dynamic = 'force-dynamic'

/**
 * GET /api/content/intelligence/org-themes
 * Returns organization-level themes with differentiated angles per persona.
 * Only accessible to authenticated users within the organization.
 * Does NOT expose private Content DNA.
 */
export async function GET() {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const store = await createScoutStore()
  const personas = await store.listContentPersonas(user.rep.id)

  // Load public data only (no private DNA)
  const personaData = await Promise.all(
    personas.map(async (p) => ({
      persona: p,
      memories: await store.listContentMemories(p.id, { limit: 50 }),
    })),
  )

  const themes = detectOrgThemes(personaData)

  // Add similarity warnings to prevent duplicate content across personas
  for (const theme of themes) {
    for (let i = 0; i < theme.relevantPersonas.length; i++) {
      for (let j = i + 1; j < theme.relevantPersonas.length; j++) {
        if (areIdeasTooSimilar(theme.relevantPersonas[i].suggestedAngle, theme.relevantPersonas[j].suggestedAngle, 0.6)) {
          theme.relevantPersonas[j].suggestedAngle += ' (differentiate further)'
        }
      }
    }
  }

  return NextResponse.json({ themes })
}
